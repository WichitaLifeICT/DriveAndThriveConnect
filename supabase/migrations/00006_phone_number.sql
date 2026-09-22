-- Add phone column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Update the trigger to capture phone from user metadata
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

  INSERT INTO public.users (id, email, full_name, avatar_url, phone, friend_code, invite_token)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    v_friend_code,
    v_invite_token
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
