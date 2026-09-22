-- ============================================================
-- RideConnectICT Trigger Fix v2
--
-- SUPERSEDED — do not run. migrations/00009_security_hardening.sql
-- defines the current handle_new_user(). Re-running this script would
-- reinstate the insecure `invited_by` auto-connect.
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- Step 1: Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Clean up any orphaned auth users that have no public.users row
-- (from previous failed signup attempts)
DELETE FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users);

-- Step 3: Drop and recreate the trigger function with better error handling
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

  -- Generate invite token using gen_random_uuid (always available, no extension needed)
  v_invite_token := replace(gen_random_uuid()::text, '-', '');
  v_invite_token := substr(v_invite_token, 1, 12);

  INSERT INTO public.users (id, email, full_name, avatar_url, friend_code, invite_token)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    v_friend_code,
    v_invite_token
  );

  -- Check if user signed up via invite link
  IF NEW.raw_user_meta_data->>'invited_by' IS NOT NULL THEN
    BEGIN
      v_invite_user_id := (NEW.raw_user_meta_data->>'invited_by')::UUID;
      IF v_invite_user_id IS NOT NULL AND v_invite_user_id != NEW.id THEN
        INSERT INTO public.connections (requester_id, addressee_id, status)
        VALUES (v_invite_user_id, NEW.id, 'accepted')
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If invited_by is invalid, just skip the connection creation
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 4: Make sure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
