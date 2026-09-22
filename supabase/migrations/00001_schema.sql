-- ============================================================
-- RideConnectICT Database Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- ==================== TABLES ====================

-- Users table (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'rider' CHECK (role IN ('rider', 'driver', 'both')),
  friend_code TEXT UNIQUE NOT NULL,
  invite_token TEXT UNIQUE NOT NULL,
  disclaimer_accepted BOOLEAN NOT NULL DEFAULT false,
  disclaimer_accepted_at TIMESTAMPTZ,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_friend_code ON public.users(friend_code);
CREATE UNIQUE INDEX idx_users_invite_token ON public.users(invite_token);

-- Connections table
CREATE TABLE public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_connection UNIQUE (requester_id, addressee_id),
  CONSTRAINT no_self_connection CHECK (requester_id != addressee_id)
);

CREATE INDEX idx_connections_requester ON public.connections(requester_id);
CREATE INDEX idx_connections_addressee ON public.connections(addressee_id);
CREATE INDEX idx_connections_status ON public.connections(status);

-- Ride requests table
CREATE TABLE public.ride_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pickup_address TEXT NOT NULL,
  pickup_place_id TEXT,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  dropoff_address TEXT NOT NULL,
  dropoff_place_id TEXT,
  dropoff_lat DOUBLE PRECISION,
  dropoff_lng DOUBLE PRECISION,
  ride_date DATE NOT NULL,
  ride_time TIME NOT NULL,
  is_round_trip BOOLEAN NOT NULL DEFAULT false,
  return_time TIME,
  notes TEXT,
  visibility TEXT NOT NULL DEFAULT 'circle' CHECK (visibility IN ('circle', 'extended', 'community')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'completed', 'cancelled')),
  matched_offer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ride_requests_rider ON public.ride_requests(rider_id);
CREATE INDEX idx_ride_requests_status ON public.ride_requests(status);
CREATE INDEX idx_ride_requests_date ON public.ride_requests(ride_date);
CREATE INDEX idx_ride_requests_visibility ON public.ride_requests(visibility);

-- Ride offers table
CREATE TABLE public.ride_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  suggested_price TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_driver_offer UNIQUE (ride_request_id, driver_id)
);

CREATE INDEX idx_ride_offers_request ON public.ride_offers(ride_request_id);
CREATE INDEX idx_ride_offers_driver ON public.ride_offers(driver_id);

-- Message threads table
CREATE TABLE public.message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_thread UNIQUE (ride_request_id, rider_id, driver_id)
);

CREATE INDEX idx_threads_rider ON public.message_threads(rider_id);
CREATE INDEX idx_threads_driver ON public.message_threads(driver_id);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_thread ON public.messages(thread_id);
CREATE INDEX idx_messages_created ON public.messages(created_at);

-- Vetted driver status table
CREATE TABLE public.vetted_driver_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  license_attestation BOOLEAN NOT NULL DEFAULT false,
  insurance_attestation BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'suspended')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vetted_status ON public.vetted_driver_status(status);

-- ==================== FUNCTIONS ====================

-- Get all direct connections for a user
CREATE OR REPLACE FUNCTION get_connections(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    CASE
      WHEN requester_id = p_user_id THEN addressee_id
      ELSE requester_id
    END
  FROM connections
  WHERE status = 'accepted'
    AND (requester_id = p_user_id OR addressee_id = p_user_id);
$$;

-- Get all 2-hop connections (friends of friends + direct)
CREATE OR REPLACE FUNCTION get_extended_connections(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH direct AS (
    SELECT get_connections AS user_id FROM get_connections(p_user_id)
  ),
  extended AS (
    SELECT get_connections AS user_id
    FROM direct, LATERAL get_connections(direct.user_id)
    WHERE get_connections != p_user_id
  )
  SELECT DISTINCT user_id FROM (
    SELECT user_id FROM direct
    UNION
    SELECT user_id FROM extended
  ) all_connections;
$$;

-- Check if a driver can see a ride request based on visibility tier
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
    WHEN 'extended' THEN
      RETURN p_driver_id IN (SELECT get_extended_connections(v_rider_id));
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

-- ==================== TRIGGER: Auto-create user profile ====================

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
  v_invite_user_id := (NEW.raw_user_meta_data->>'invited_by')::UUID;
  IF v_invite_user_id IS NOT NULL AND v_invite_user_id != NEW.id THEN
    INSERT INTO public.connections (requester_id, addressee_id, status)
    VALUES (v_invite_user_id, NEW.id, 'accepted')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ==================== ROW LEVEL SECURITY ====================

-- Users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all profiles"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Connections
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON public.connections FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = requester_id
    OR (SELECT auth.uid()) = addressee_id
  );

CREATE POLICY "Users can send connection requests"
  ON public.connections FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = requester_id);

CREATE POLICY "Addressee can update connection status"
  ON public.connections FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = addressee_id);

-- Ride Requests
ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view eligible ride requests"
  ON public.ride_requests FOR SELECT
  TO authenticated
  USING (
    rider_id = (SELECT auth.uid())
    OR can_see_ride_request((SELECT auth.uid()), id)
  );

CREATE POLICY "Users can create ride requests"
  ON public.ride_requests FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = rider_id);

CREATE POLICY "Riders can update own requests"
  ON public.ride_requests FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = rider_id);

-- Ride Offers
ALTER TABLE public.ride_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant offers"
  ON public.ride_offers FOR SELECT
  TO authenticated
  USING (
    driver_id = (SELECT auth.uid())
    OR ride_request_id IN (
      SELECT id FROM public.ride_requests WHERE rider_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Drivers can create offers"
  ON public.ride_offers FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = driver_id);

CREATE POLICY "Users can update relevant offers"
  ON public.ride_offers FOR UPDATE
  TO authenticated
  USING (
    driver_id = (SELECT auth.uid())
    OR ride_request_id IN (
      SELECT id FROM public.ride_requests WHERE rider_id = (SELECT auth.uid())
    )
  );

-- Message Threads
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants can view"
  ON public.message_threads FOR SELECT
  TO authenticated
  USING (
    rider_id = (SELECT auth.uid())
    OR driver_id = (SELECT auth.uid())
  );

CREATE POLICY "Thread participants can create"
  ON public.message_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    rider_id = (SELECT auth.uid())
    OR driver_id = (SELECT auth.uid())
  );

-- Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants can view messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    thread_id IN (
      SELECT id FROM public.message_threads
      WHERE rider_id = (SELECT auth.uid())
        OR driver_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND thread_id IN (
      SELECT id FROM public.message_threads
      WHERE rider_id = (SELECT auth.uid())
        OR driver_id = (SELECT auth.uid())
    )
  );

-- Vetted Driver Status
ALTER TABLE public.vetted_driver_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vetting status"
  ON public.vetted_driver_status FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can apply for vetting"
  ON public.vetted_driver_status FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ==================== ENABLE REALTIME ====================
-- Run this to enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
