-- ============================================================
-- Migration: Add organization column + replace extended with organization visibility
-- ============================================================

BEGIN;

-- 1. Add organization column to users
ALTER TABLE public.users ADD COLUMN organization TEXT DEFAULT NULL;

-- 2. Migrate existing 'extended' rows to 'organization'
UPDATE public.ride_requests SET visibility = 'organization' WHERE visibility = 'extended';

-- 3. Drop old CHECK constraint and add new one
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.ride_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%visibility%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ride_requests DROP CONSTRAINT ' || v_constraint_name;
  END IF;
END $$;

ALTER TABLE public.ride_requests
  ADD CONSTRAINT ride_requests_visibility_check
  CHECK (visibility IN ('circle', 'organization', 'community'));

-- 4. Replace can_see_ride_request function with organization logic
CREATE OR REPLACE FUNCTION can_see_ride_request(
  p_driver_id UUID,
  p_ride_request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_rider_id UUID;
  v_visibility TEXT;
BEGIN
  SELECT rider_id, visibility INTO v_rider_id, v_visibility
  FROM ride_requests WHERE id = p_ride_request_id;

  IF v_rider_id = p_driver_id THEN RETURN false; END IF;

  CASE v_visibility
    WHEN 'circle' THEN
      RETURN EXISTS (
        SELECT 1 FROM connections
        WHERE status = 'accepted'
          AND ((requester_id = v_rider_id AND addressee_id = p_driver_id)
            OR (requester_id = p_driver_id AND addressee_id = v_rider_id))
      );
    WHEN 'organization' THEN
      RETURN EXISTS (
        SELECT 1 FROM vetted_driver_status vds
        JOIN users u_driver ON u_driver.id = p_driver_id
        JOIN users u_rider ON u_rider.id = v_rider_id
        WHERE vds.user_id = p_driver_id
          AND vds.status = 'approved'
          AND u_driver.organization = u_rider.organization
          AND u_rider.organization IS NOT NULL
          AND u_rider.organization != 'none'
      );
    WHEN 'community' THEN
      RETURN EXISTS (
        SELECT 1 FROM vetted_driver_status
        WHERE user_id = p_driver_id AND status = 'approved'
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- 5. Update handle_new_user trigger to store organization from signup metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friend_code TEXT;
  v_invite_token TEXT;
  v_invite_user_id UUID;
BEGIN
  -- Generate friend code (retry on collision)
  LOOP
    v_friend_code := upper(substr(md5(random()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE friend_code = v_friend_code);
  END LOOP;

  -- Generate invite token
  v_invite_token := encode(gen_random_bytes(9), 'base64');
  v_invite_token := replace(replace(replace(v_invite_token, '+', ''), '/', ''), '=', '');

  INSERT INTO public.users (id, email, full_name, avatar_url, friend_code, invite_token, organization)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    v_friend_code,
    v_invite_token,
    NEW.raw_user_meta_data->>'organization'
  );

  -- Check if user signed up via invite link
  v_invite_user_id := (NEW.raw_user_meta_data->>'invited_by')::UUID;
  IF v_invite_user_id IS NOT NULL AND v_invite_user_id != NEW.id THEN
    INSERT INTO public.connections (requester_id, addressee_id, status)
    VALUES (v_invite_user_id, NEW.id, 'accepted')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
