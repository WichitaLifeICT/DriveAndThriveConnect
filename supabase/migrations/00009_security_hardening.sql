-- ============================================================
-- Migration: Security hardening
--
-- Any signed-in user can call the Supabase REST API directly with the
-- public anon key, so RLS policies and column privileges are the real
-- access boundary — server actions are not. This migration closes the
-- holes that let users bypass the app's rules:
--   * self-promotion to admin / self-approving organizations
--   * self-approving driver vetting
--   * forcing connections to "accepted" (and auto-connecting to any
--     user through the signup `invited_by` metadata)
--   * drivers accepting their own offers or offering on rides they
--     cannot see
--   * opening message threads with, or reviewing, arbitrary users
--   * reading other users' email, phone, invite token and admin flag
--   * reading anyone's connection graph through get_connections()
-- ============================================================

BEGIN;

-- ==================== USERS: column privileges ====================
-- Other users only need public profile fields. Private fields (email,
-- phone, invite_token, is_admin, organizations, ...) are read and written
-- server-side with the service role, scoped to the signed-in user.

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;

GRANT SELECT (id, full_name, avatar_url, role, created_at)
  ON public.users TO authenticated;

GRANT UPDATE (full_name, phone, avatar_url, role, notify_email, updated_at)
  ON public.users TO authenticated;

-- ==================== CONNECTIONS ====================

DROP POLICY IF EXISTS "Users can send connection requests" ON public.connections;
CREATE POLICY "Users can send connection requests"
  ON public.connections FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = requester_id
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Addressee can update connection status" ON public.connections;
CREATE POLICY "Addressee can update connection status"
  ON public.connections FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = addressee_id)
  WITH CHECK (
    (SELECT auth.uid()) = addressee_id
    AND status IN ('accepted', 'declined')
  );

REVOKE UPDATE ON public.connections FROM anon, authenticated;
GRANT UPDATE (status, updated_at) ON public.connections TO authenticated;

-- ==================== RIDE OFFERS ====================

DROP POLICY IF EXISTS "Drivers can create offers" ON public.ride_offers;
CREATE POLICY "Drivers can create offers"
  ON public.ride_offers FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = driver_id
    AND status = 'pending'
    AND can_see_ride_request((SELECT auth.uid()), ride_request_id)
    AND EXISTS (
      SELECT 1 FROM public.ride_requests r
      WHERE r.id = ride_request_id AND r.status = 'open'
    )
  );

DROP POLICY IF EXISTS "Users can update relevant offers" ON public.ride_offers;

-- Drivers may only withdraw their own offers
CREATE POLICY "Drivers can withdraw own offers"
  ON public.ride_offers FOR UPDATE
  TO authenticated
  USING (driver_id = (SELECT auth.uid()))
  WITH CHECK (
    driver_id = (SELECT auth.uid())
    AND status IN ('pending', 'withdrawn')
  );

-- Riders may accept or decline offers on their own rides
CREATE POLICY "Riders can respond to offers"
  ON public.ride_offers FOR UPDATE
  TO authenticated
  USING (
    ride_request_id IN (
      SELECT id FROM public.ride_requests WHERE rider_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    ride_request_id IN (
      SELECT id FROM public.ride_requests WHERE rider_id = (SELECT auth.uid())
    )
  );

REVOKE UPDATE ON public.ride_offers FROM anon, authenticated;
GRANT UPDATE (status, updated_at) ON public.ride_offers TO authenticated;

-- ==================== MESSAGE THREADS ====================
-- A thread must be between the ride's rider and a driver who has made
-- an offer on it (rider-initiated), or a driver who can see the ride.

DROP POLICY IF EXISTS "Thread participants can create" ON public.message_threads;
CREATE POLICY "Thread participants can create"
  ON public.message_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      rider_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.ride_requests r
        WHERE r.id = ride_request_id AND r.rider_id = (SELECT auth.uid())
      )
      AND EXISTS (
        SELECT 1 FROM public.ride_offers o
        WHERE o.ride_request_id = message_threads.ride_request_id
          AND o.driver_id = message_threads.driver_id
      )
    )
    OR (
      driver_id = (SELECT auth.uid())
      AND can_see_ride_request((SELECT auth.uid()), ride_request_id)
      AND EXISTS (
        SELECT 1 FROM public.ride_requests r
        WHERE r.id = ride_request_id AND r.rider_id = message_threads.rider_id
      )
    )
  );

-- ==================== DRIVER REVIEWS ====================
-- Only the rider of a completed ride may review the driver whose offer
-- was accepted for that ride.

DROP POLICY IF EXISTS "Reviewer can insert own review" ON public.driver_reviews;
CREATE POLICY "Reviewer can insert own review"
  ON public.driver_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = reviewer_id
    AND EXISTS (
      SELECT 1
      FROM public.ride_requests r
      JOIN public.ride_offers o
        ON o.id = r.matched_offer_id AND o.ride_request_id = r.id
      WHERE r.id = driver_reviews.ride_request_id
        AND r.rider_id = (SELECT auth.uid())
        AND r.status = 'completed'
        AND o.status = 'accepted'
        AND o.driver_id = driver_reviews.driver_id
    )
  );

-- ==================== VETTED DRIVER STATUS ====================

DROP POLICY IF EXISTS "Users can apply for vetting" ON public.vetted_driver_status;
CREATE POLICY "Users can apply for vetting"
  ON public.vetted_driver_status FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_notes IS NULL
    AND (driver_scope IS NULL OR driver_scope IN ('friend', 'organization', 'community', 'any'))
  );

-- ==================== FUNCTIONS ====================
-- Pin search_path on SECURITY DEFINER functions, and stop exposing the
-- connection-graph helpers over RPC (anyone could list anyone's friends).

ALTER FUNCTION public.get_connections(UUID) SET search_path = public;
ALTER FUNCTION public.get_extended_connections(UUID) SET search_path = public;
ALTER FUNCTION public.can_see_ride_request(UUID, UUID) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_connections(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_extended_connections(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_connections(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_extended_connections(UUID) TO service_role;

-- ==================== SIGNUP TRIGGER ====================
-- Invites are resolved from the inviter's secret invite token rather than
-- a raw user id (user ids are not secret, so `invited_by` let anyone
-- auto-connect to anyone). Also restores storing organization, which
-- 00006 dropped.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friend_code TEXT;
  v_invite_token TEXT;
  v_inviter_id UUID;
BEGIN
  -- Generate friend code (retry on collision)
  LOOP
    v_friend_code := upper(substr(md5(random()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE friend_code = v_friend_code);
  END LOOP;

  -- Generate invite token (retry on collision)
  LOOP
    v_invite_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE invite_token = v_invite_token);
  END LOOP;

  INSERT INTO public.users (id, email, full_name, avatar_url, phone, organization, friend_code, invite_token)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'organization', ''),
    v_friend_code,
    v_invite_token
  );

  -- Auto-connect with the inviter when signing up through an invite link
  IF NULLIF(NEW.raw_user_meta_data->>'invite_token', '') IS NOT NULL THEN
    SELECT id INTO v_inviter_id
    FROM public.users
    WHERE invite_token = NEW.raw_user_meta_data->>'invite_token';

    IF v_inviter_id IS NOT NULL AND v_inviter_id != NEW.id THEN
      INSERT INTO public.connections (requester_id, addressee_id, status)
      VALUES (v_inviter_id, NEW.id, 'accepted')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
