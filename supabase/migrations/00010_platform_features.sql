-- ============================================================
-- Migration: Platform features
--   * Safety: real suspension, blocking, reports, vetting documents and
--     expiry, pickup/drop-off check-ins, trip sharing, emergency contact
--   * Notifications (in-app, with email sent by the app)
--   * Ride lifecycle: expiry, back-out / no-show, return legs, recurring
--   * Organizations as real tables (users.organization becomes a cache)
--   * Messaging: read tracking, admin messages
--   * Rate limiting
-- Requires 00009_security_hardening.sql.
-- Safe to re-run: every step checks for or replaces what it creates, so a
-- partially applied run can simply be run again.
-- ============================================================

BEGIN;

-- Function bodies reference tables created in this same file
SET LOCAL check_function_bodies = false;

-- ==================== USERS ====================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS share_phone_when_matched BOOLEAN NOT NULL DEFAULT true;

GRANT UPDATE (emergency_contact_name, emergency_contact_phone, share_phone_when_matched)
  ON public.users TO authenticated;

CREATE OR REPLACE FUNCTION public.is_active_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Clients may only ask about themselves; the service role (no auth.uid())
  -- may ask about anyone.
  SELECT (auth.uid() IS NULL OR auth.uid() = p_user_id)
    AND EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND suspended_at IS NULL);
$$;

-- Admin reviewer references must not block deleting an account
ALTER TABLE public.vetted_driver_status
  DROP CONSTRAINT IF EXISTS vetted_driver_status_reviewed_by_fkey;
ALTER TABLE public.vetted_driver_status
  ADD CONSTRAINT vetted_driver_status_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ==================== BLOCKS ====================

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own blocks" ON public.user_blocks;
CREATE POLICY "Users can view own blocks"
  ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can block" ON public.user_blocks;
CREATE POLICY "Users can block"
  ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can unblock" ON public.user_blocks;
CREATE POLICY "Users can unblock"
  ON public.user_blocks FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

REVOKE UPDATE ON public.user_blocks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_blocked_between(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Clients may only ask about pairs they're part of
  SELECT (auth.uid() IS NULL OR auth.uid() IN (p_a, p_b))
    AND EXISTS (
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = p_a AND blocked_id = p_b)
         OR (blocker_id = p_b AND blocked_id = p_a)
    );
$$;

-- ==================== REPORTS ====================

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ride_request_id UUID REFERENCES public.ride_requests(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.message_threads(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'safety_incident', 'harassment', 'unsafe_driving', 'no_show',
    'inappropriate_message', 'other'
  )),
  details TEXT CHECK (char_length(details) <= 4000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON public.reports(reported_user_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporters can view own reports" ON public.reports;
CREATE POLICY "Reporters can view own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can file reports" ON public.reports;
CREATE POLICY "Users can file reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND status = 'open'
    AND admin_notes IS NULL
    AND resolved_by IS NULL
  );

REVOKE UPDATE, DELETE ON public.reports FROM anon, authenticated;

-- ==================== VETTING: documents + expiry ====================

ALTER TABLE public.vetted_driver_status
  ADD COLUMN IF NOT EXISTS license_expires_on DATE,
  ADD COLUMN IF NOT EXISTS insurance_expires_on DATE,
  ADD COLUMN IF NOT EXISTS license_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS insurance_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMPTZ;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.vetted_driver_status'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.vetted_driver_status DROP CONSTRAINT ' || v_constraint_name;
  END IF;
END $$;

ALTER TABLE public.vetted_driver_status
  ADD CONSTRAINT vetted_driver_status_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'suspended', 'expired'));

-- Applications (with document uploads) are now submitted by the server
-- with the service role; clients can no longer insert directly.
DROP POLICY IF EXISTS "Users can apply for vetting" ON public.vetted_driver_status;
REVOKE INSERT, UPDATE, DELETE ON public.vetted_driver_status FROM anon, authenticated;

-- Private bucket for license / insurance documents (Supabase Storage).
-- Only the service role reads or writes it; admins view via signed URLs.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('vetting-docs', 'vetting-docs', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ==================== ORGANIZATIONS ====================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_orgs_org ON public.user_organizations(organization_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can list active organizations" ON public.organizations;
CREATE POLICY "Anyone can list active organizations"
  ON public.organizations FOR SELECT TO anon, authenticated
  USING (is_active);

DROP POLICY IF EXISTS "Users can view own memberships" ON public.user_organizations;
CREATE POLICY "Users can view own memberships"
  ON public.user_organizations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_organizations FROM anon, authenticated;

-- Seed the organizations that were hardcoded in the app, then carry over
-- existing memberships from the comma-separated columns. "other: X"
-- write-ins become inactive organizations an admin can review.
-- (Data steps in this file run as dynamic SQL inside DO blocks: the
-- Supabase SQL editor can't see tables/columns created earlier in the same
-- run from a plain INSERT/UPDATE, but dynamic SQL is resolved when it runs.)
DO $$
BEGIN
  EXECUTE $q$
    INSERT INTO public.organizations (name) VALUES
      ('Hope 4 Da Hood'), ('Family Promise'), ('Shepherd''s Way'),
      ('Wichita Recovery Hub'), ('Empower North End'), ('Build & Rebuild'), ('Hope CDC')
    ON CONFLICT (name) DO NOTHING
  $q$;

  EXECUTE $q$
    WITH raw AS (
      SELECT u.id AS user_id, trim(o) AS org, 'approved' AS status
      FROM public.users u, unnest(string_to_array(u.organization, ',')) AS o
      UNION ALL
      SELECT u.id, trim(o), 'pending'
      FROM public.users u, unnest(string_to_array(u.pending_organizations, ',')) AS o
    ), cleaned AS (
      SELECT user_id,
             CASE WHEN org ILIKE 'other:%' THEN trim(substr(org, 7)) ELSE org END AS org,
             org ILIKE 'other:%' AS is_write_in
      FROM raw
      WHERE org <> '' AND lower(org) <> 'none'
    )
    INSERT INTO public.organizations (name, is_active)
    SELECT DISTINCT ON (org) org, NOT is_write_in
    FROM cleaned
    WHERE org <> ''
    ORDER BY org, is_write_in
    ON CONFLICT (name) DO NOTHING
  $q$;

  EXECUTE $q$
    WITH raw AS (
      SELECT u.id AS user_id, trim(o) AS org, 'approved' AS status
      FROM public.users u, unnest(string_to_array(u.organization, ',')) AS o
      UNION ALL
      SELECT u.id, trim(o), 'pending'
      FROM public.users u, unnest(string_to_array(u.pending_organizations, ',')) AS o
    ), cleaned AS (
      SELECT user_id,
             CASE WHEN org ILIKE 'other:%' THEN trim(substr(org, 7)) ELSE org END AS org,
             status
      FROM raw
      WHERE org <> '' AND lower(org) <> 'none'
    )
    INSERT INTO public.user_organizations (user_id, organization_id, status)
    SELECT DISTINCT ON (c.user_id, o.id) c.user_id, o.id, c.status
    FROM cleaned c
    JOIN public.organizations o ON o.name = c.org
    WHERE c.org <> ''
    ORDER BY c.user_id, o.id, (c.status = 'approved') DESC
    ON CONFLICT DO NOTHING
  $q$;
END
$$;

-- Clean up the scratch table from an earlier version of this file
DROP TABLE IF EXISTS public._org_backfill;

-- Keep users.organization / pending_organizations as a read-only cache of
-- the membership tables so existing screens keep working.
CREATE OR REPLACE FUNCTION public.sync_user_org_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
BEGIN
  FOR v_user IN
    SELECT DISTINCT uid FROM (
      SELECT CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.user_id END AS uid
      UNION ALL
      SELECT CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.user_id END
    ) s WHERE uid IS NOT NULL
  LOOP
    UPDATE users SET
      organization = (
        SELECT string_agg(o.name, ',' ORDER BY o.name)
        FROM user_organizations uo JOIN organizations o ON o.id = uo.organization_id
        WHERE uo.user_id = v_user AND uo.status = 'approved'
      ),
      pending_organizations = (
        SELECT string_agg(o.name, ',' ORDER BY o.name)
        FROM user_organizations uo JOIN organizations o ON o.id = uo.organization_id
        WHERE uo.user_id = v_user AND uo.status = 'pending'
      )
    WHERE id = v_user;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS user_organizations_sync ON public.user_organizations;
CREATE TRIGGER user_organizations_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.user_organizations
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_org_cache();

CREATE OR REPLACE FUNCTION public.sync_org_rename_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Touch memberships so the per-user trigger rebuilds the cached names
  UPDATE user_organizations SET status = status WHERE organization_id = NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS organizations_rename_sync ON public.organizations;
CREATE TRIGGER organizations_rename_sync
  AFTER UPDATE OF name ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.sync_org_rename_cache();

-- Normalize the cache once for everyone. Only clear placeholder values;
-- never blank a real organization list (if the backfill above didn't run,
-- that list is the only copy).
DO $$
BEGIN
  EXECUTE $q$ UPDATE public.user_organizations SET status = status $q$;
  EXECUTE $q$
    UPDATE public.users SET organization = NULL
    WHERE lower(trim(organization)) IN ('', 'none')
      AND id NOT IN (SELECT user_id FROM public.user_organizations)
  $q$;
  EXECUTE $q$
    UPDATE public.users SET pending_organizations = NULL
    WHERE lower(trim(pending_organizations)) IN ('', 'none')
      AND id NOT IN (SELECT user_id FROM public.user_organizations)
  $q$;
END
$$;

-- ==================== RIDE REQUESTS ====================

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dropped_off_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS series_id UUID,
  ADD COLUMN IF NOT EXISTS parent_ride_id UUID REFERENCES public.ride_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_day_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_soon_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_prompt_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ride_requests_series ON public.ride_requests(series_id);

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.ride_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%''matched''%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ride_requests DROP CONSTRAINT ' || v_constraint_name;
  END IF;
END $$;

ALTER TABLE public.ride_requests
  ADD CONSTRAINT ride_requests_status_check
  CHECK (status IN ('open', 'matched', 'completed', 'cancelled', 'expired'));

ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_notes_length;
ALTER TABLE public.ride_requests
  ADD CONSTRAINT ride_requests_notes_length CHECK (char_length(notes) <= 1000) NOT VALID;

-- Backfill timestamps for reporting
DO $$
BEGIN
  EXECUTE $q$
    UPDATE public.ride_requests SET matched_at = updated_at
    WHERE matched_at IS NULL AND status IN ('matched', 'completed') AND matched_offer_id IS NOT NULL
  $q$;
  EXECUTE $q$
    UPDATE public.ride_requests SET completed_at = updated_at
    WHERE completed_at IS NULL AND status = 'completed'
  $q$;
  EXECUTE $q$
    UPDATE public.ride_requests SET cancelled_at = updated_at
    WHERE cancelled_at IS NULL AND status = 'cancelled'
  $q$;
END
$$;

-- Share tokens are private to the rider (read server-side); every other
-- column stays readable under the row-level policy.
REVOKE SELECT ON public.ride_requests FROM anon, authenticated;
GRANT SELECT (
  id, rider_id,
  pickup_address, pickup_place_id, pickup_lat, pickup_lng,
  dropoff_address, dropoff_place_id, dropoff_lat, dropoff_lng,
  ride_date, ride_time, is_round_trip, return_time, notes, visibility,
  status, matched_offer_id, created_at, updated_at,
  matched_at, completed_at, cancelled_at, picked_up_at, dropped_off_at,
  series_id, parent_ride_id
) ON public.ride_requests TO authenticated;

-- Riders only create rides while active
DROP POLICY IF EXISTS "Users can create ride requests" ON public.ride_requests;
CREATE POLICY "Users can create ride requests"
  ON public.ride_requests FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = rider_id
    AND status = 'open'
    AND is_active_user((SELECT auth.uid()))
  );

-- Riders may edit and cancel their own ride; lifecycle transitions that
-- involve the driver (match, check-ins, completion, back-out) are done by
-- the server with the service role.
DROP POLICY IF EXISTS "Riders can update own requests" ON public.ride_requests;
CREATE POLICY "Riders can update own requests"
  ON public.ride_requests FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = rider_id)
  WITH CHECK ((SELECT auth.uid()) = rider_id);

REVOKE UPDATE ON public.ride_requests FROM anon, authenticated;
GRANT UPDATE (
  pickup_address, pickup_place_id, pickup_lat, pickup_lng,
  dropoff_address, dropoff_place_id, dropoff_lat, dropoff_lng,
  ride_date, ride_time, is_round_trip, return_time, notes, visibility,
  status, cancelled_at, updated_at
) ON public.ride_requests TO authenticated;

-- Rider-side status changes limited to cancelling (and reopening a
-- cancelled/expired ride is not allowed from the client)
CREATE OR REPLACE FUNCTION public.guard_ride_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_user = 'authenticated'
     AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Riders can only cancel rides directly';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ride_requests_status_guard ON public.ride_requests;
CREATE TRIGGER ride_requests_status_guard
  BEFORE UPDATE OF status ON public.ride_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_ride_status_change();

-- ==================== RIDE OFFERS ====================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.ride_offers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%withdrawn%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ride_offers DROP CONSTRAINT ' || v_constraint_name;
  END IF;
END $$;

ALTER TABLE public.ride_offers
  ADD CONSTRAINT ride_offers_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'backed_out', 'no_show', 'cancelled'));

ALTER TABLE public.ride_offers DROP CONSTRAINT IF EXISTS ride_offers_message_length;
ALTER TABLE public.ride_offers
  ADD CONSTRAINT ride_offers_message_length CHECK (char_length(message) <= 1000) NOT VALID;

DROP POLICY IF EXISTS "Drivers can create offers" ON public.ride_offers;
CREATE POLICY "Drivers can create offers"
  ON public.ride_offers FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = driver_id
    AND status = 'pending'
    AND is_active_user((SELECT auth.uid()))
    AND can_see_ride_request((SELECT auth.uid()), ride_request_id)
    AND EXISTS (
      SELECT 1 FROM public.ride_requests r
      WHERE r.id = ride_request_id AND r.status = 'open'
    )
  );

-- Riders decline offers directly; accepting (which also updates the ride)
-- is done server-side.
DROP POLICY IF EXISTS "Riders can respond to offers" ON public.ride_offers;
CREATE POLICY "Riders can respond to offers"
  ON public.ride_offers FOR UPDATE TO authenticated
  USING (
    ride_request_id IN (
      SELECT id FROM public.ride_requests WHERE rider_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status = 'declined'
    AND ride_request_id IN (
      SELECT id FROM public.ride_requests WHERE rider_id = (SELECT auth.uid())
    )
  );

-- ==================== VISIBILITY ====================

CREATE OR REPLACE FUNCTION public.can_see_ride_request(
  p_driver_id UUID,
  p_ride_request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider_id UUID;
  v_visibility TEXT;
  v_driver_scope TEXT;
BEGIN
  SELECT rider_id, visibility INTO v_rider_id, v_visibility
  FROM ride_requests WHERE id = p_ride_request_id;

  -- Clients may only ask about themselves (RLS always passes auth.uid())
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_driver_id THEN RETURN false; END IF;
  IF v_rider_id IS NULL OR v_rider_id = p_driver_id THEN RETURN false; END IF;
  IF NOT is_active_user(p_driver_id) THEN RETURN false; END IF;
  IF is_blocked_between(p_driver_id, v_rider_id) THEN RETURN false; END IF;

  -- Driver who already offered keeps access (e.g. after the ride matched)
  IF EXISTS (
    SELECT 1 FROM ride_offers
    WHERE ride_request_id = p_ride_request_id AND driver_id = p_driver_id
  ) THEN
    RETURN true;
  END IF;

  -- Approved, unexpired vetting (NULL if not vetted)
  SELECT driver_scope INTO v_driver_scope
  FROM vetted_driver_status
  WHERE user_id = p_driver_id
    AND status = 'approved'
    AND (license_expires_on IS NULL OR license_expires_on >= current_date)
    AND (insurance_expires_on IS NULL OR insurance_expires_on >= current_date);

  CASE v_visibility
    WHEN 'circle' THEN
      RETURN EXISTS (
        SELECT 1 FROM connections
        WHERE status = 'accepted'
          AND ((requester_id = v_rider_id AND addressee_id = p_driver_id)
            OR (requester_id = p_driver_id AND addressee_id = v_rider_id))
      );

    WHEN 'organization' THEN
      IF v_driver_scope IS NULL OR v_driver_scope NOT IN ('organization', 'any') THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1
        FROM user_organizations d
        JOIN user_organizations r ON r.organization_id = d.organization_id
        JOIN organizations o ON o.id = d.organization_id
        WHERE d.user_id = p_driver_id AND d.status = 'approved'
          AND r.user_id = v_rider_id AND r.status = 'approved'
          AND o.is_active
      );

    WHEN 'community' THEN
      RETURN v_driver_scope IN ('community', 'any');

    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- ==================== CONNECTIONS ====================

DROP POLICY IF EXISTS "Users can send connection requests" ON public.connections;
CREATE POLICY "Users can send connection requests"
  ON public.connections FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = requester_id
    AND status = 'pending'
    AND is_active_user((SELECT auth.uid()))
    AND NOT is_blocked_between(requester_id, addressee_id)
  );

-- Either side may remove a connection (used when blocking / unfriending)
DROP POLICY IF EXISTS "Participants can remove connections" ON public.connections;
CREATE POLICY "Participants can remove connections"
  ON public.connections FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = requester_id OR (SELECT auth.uid()) = addressee_id
  );

-- ==================== MESSAGING ====================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_admin_message BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_length;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length CHECK (char_length(content) BETWEEN 1 AND 4000) NOT VALID;

DROP POLICY IF EXISTS "Thread participants can create" ON public.message_threads;
CREATE POLICY "Thread participants can create"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (
    is_active_user((SELECT auth.uid()))
    AND NOT is_blocked_between(rider_id, driver_id)
    AND (
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
    )
  );

DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND is_admin_message = false
    AND is_active_user((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = thread_id
        AND (t.rider_id = (SELECT auth.uid()) OR t.driver_id = (SELECT auth.uid()))
        AND NOT is_blocked_between(t.rider_id, t.driver_id)
    )
  );

CREATE TABLE IF NOT EXISTS public.message_reads (
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own read markers" ON public.message_reads;
CREATE POLICY "Users manage own read markers"
  ON public.message_reads FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND thread_id IN (
      SELECT id FROM public.message_threads
      WHERE rider_id = (SELECT auth.uid()) OR driver_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.unread_message_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM messages m
  JOIN message_threads t ON t.id = m.thread_id
  LEFT JOIN message_reads r ON r.thread_id = t.id AND r.user_id = p_user_id
  WHERE (t.rider_id = p_user_id OR t.driver_id = p_user_id)
    AND m.sender_id <> p_user_id
    AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    -- only callable for yourself (service role passes any id)
    AND (auth.uid() IS NULL OR auth.uid() = p_user_id);
$$;

-- ==================== REVIEWS / VETTING INSERTS: active users only ====================

DROP POLICY IF EXISTS "Reviewer can insert own review" ON public.driver_reviews;
CREATE POLICY "Reviewer can insert own review"
  ON public.driver_reviews FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = reviewer_id
    AND is_active_user((SELECT auth.uid()))
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

-- ==================== NOTIFICATIONS ====================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ==================== RATE LIMITING ====================

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON public.rate_limit_events(user_id, action, created_at DESC);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_events FROM anon, authenticated;

-- Records an attempt and returns whether it is within the limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM rate_limit_events
  WHERE user_id = p_user_id
    AND action = p_action
    AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_events (user_id, action) VALUES (p_user_id, p_action);

  -- Opportunistic cleanup of old events
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_events WHERE created_at < now() - interval '2 days';
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO service_role;

-- ==================== SCHEDULED JOB HELPERS ====================
-- Ride date/time are local Wichita time.

CREATE OR REPLACE FUNCTION public.ride_starts_at(p_date DATE, p_time TIME)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_date + p_time) AT TIME ZONE 'America/Chicago';
$$;

-- Open rides whose start time passed more than an hour ago
CREATE OR REPLACE FUNCTION public.expire_stale_rides()
RETURNS TABLE (ride_id UUID, rider_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expired AS (
    UPDATE ride_requests
    SET status = 'expired', updated_at = now()
    WHERE status = 'open'
      AND ride_starts_at(ride_date, ride_time) < now() - interval '1 hour'
    RETURNING id, ride_requests.rider_id
  ), offers AS (
    UPDATE ride_offers SET status = 'cancelled', updated_at = now()
    WHERE status = 'pending' AND ride_request_id IN (SELECT id FROM expired)
  )
  SELECT id, expired.rider_id FROM expired;
$$;

-- Approved drivers whose license or insurance has lapsed
CREATE OR REPLACE FUNCTION public.expire_lapsed_vetting()
RETURNS TABLE (user_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE vetted_driver_status
  SET status = 'expired', updated_at = now()
  WHERE status = 'approved'
    AND (license_expires_on < current_date OR insurance_expires_on < current_date)
  RETURNING vetted_driver_status.user_id;
$$;

-- Drivers who should hear about a new ride: the same visibility rule the
-- ride_requests policy uses, so notifications never leak a ride.
CREATE OR REPLACE FUNCTION public.eligible_drivers_for_ride(p_ride_id UUID)
RETURNS TABLE (user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM users u
  WHERE u.role = 'driver'
    AND u.suspended_at IS NULL
    AND can_see_ride_request(u.id, p_ride_id);
$$;

REVOKE EXECUTE ON FUNCTION public.eligible_drivers_for_ride(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_drivers_for_ride(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.expire_stale_rides() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_lapsed_vetting() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_rides() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_lapsed_vetting() TO service_role;

-- ==================== SIGNUP TRIGGER ====================
-- Organizations chosen at signup become memberships (approved: every new
-- account starts as a rider, and riders' orgs don't need approval).

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
  v_org_id UUID;
  v_org TEXT;
BEGIN
  LOOP
    v_friend_code := upper(substr(md5(random()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE friend_code = v_friend_code);
  END LOOP;

  LOOP
    v_invite_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE invite_token = v_invite_token);
  END LOOP;

  INSERT INTO public.users (id, email, full_name, avatar_url, phone, friend_code, invite_token)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    v_friend_code,
    v_invite_token
  );

  -- Organization ids chosen at signup (active organizations only)
  FOR v_org IN
    SELECT trim(x) FROM unnest(string_to_array(COALESCE(NEW.raw_user_meta_data->>'organization_ids', ''), ',')) AS x
  LOOP
    BEGIN
      v_org_id := v_org::UUID;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    INSERT INTO public.user_organizations (user_id, organization_id, status)
    SELECT NEW.id, o.id, 'approved' FROM public.organizations o
    WHERE o.id = v_org_id AND o.is_active
    ON CONFLICT DO NOTHING;
  END LOOP;

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
