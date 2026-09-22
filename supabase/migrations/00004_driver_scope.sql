-- ============================================================
-- Migration: Add driver_scope to vetted_driver_status + update visibility function
-- ============================================================

BEGIN;

-- 1. Add driver_scope column
ALTER TABLE public.vetted_driver_status
  ADD COLUMN driver_scope TEXT DEFAULT NULL;

-- 2. Set existing approved drivers to 'any' scope for backward compatibility
UPDATE public.vetted_driver_status
  SET driver_scope = 'any'
  WHERE status = 'approved' AND driver_scope IS NULL;

-- 3. Update can_see_ride_request to respect driver scope
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
  v_driver_scope TEXT;
BEGIN
  SELECT rider_id, visibility INTO v_rider_id, v_visibility
  FROM ride_requests WHERE id = p_ride_request_id;

  IF v_rider_id = p_driver_id THEN RETURN false; END IF;

  -- Get driver's approved scope (NULL if not vetted)
  SELECT driver_scope INTO v_driver_scope
  FROM vetted_driver_status
  WHERE user_id = p_driver_id AND status = 'approved';

  CASE v_visibility
    WHEN 'circle' THEN
      -- Circle: must be a direct connection
      RETURN EXISTS (
        SELECT 1 FROM connections
        WHERE status = 'accepted'
          AND ((requester_id = v_rider_id AND addressee_id = p_driver_id)
            OR (requester_id = p_driver_id AND addressee_id = v_rider_id))
      );

    WHEN 'organization' THEN
      -- Organization: driver must be vetted, same org, and scope allows org
      IF v_driver_scope IS NULL THEN RETURN false; END IF;
      IF v_driver_scope NOT IN ('organization', 'any') THEN RETURN false; END IF;
      RETURN EXISTS (
        SELECT 1 FROM users u_driver
        JOIN users u_rider ON u_rider.id = v_rider_id
        WHERE u_driver.id = p_driver_id
          AND u_driver.organization = u_rider.organization
          AND u_rider.organization IS NOT NULL
          AND u_rider.organization != 'none'
      );

    WHEN 'community' THEN
      -- Community: driver must be vetted and scope allows community
      IF v_driver_scope IS NULL THEN RETURN false; END IF;
      IF v_driver_scope NOT IN ('community', 'any') THEN RETURN false; END IF;
      RETURN true;

    ELSE
      RETURN false;
  END CASE;
END;
$$;

COMMIT;
