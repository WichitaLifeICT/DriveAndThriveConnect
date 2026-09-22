-- ============================================================
-- Migration: Update can_see_ride_request for multi-org support
-- Organizations stored as comma-separated TEXT (e.g. "Hope 4 Da Hood,Family Promise")
-- ============================================================

BEGIN;

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
      RETURN EXISTS (
        SELECT 1 FROM connections
        WHERE status = 'accepted'
          AND ((requester_id = v_rider_id AND addressee_id = p_driver_id)
            OR (requester_id = p_driver_id AND addressee_id = v_rider_id))
      );

    WHEN 'organization' THEN
      IF v_driver_scope IS NULL THEN RETURN false; END IF;
      IF v_driver_scope NOT IN ('organization', 'any') THEN RETURN false; END IF;
      -- Check if any of the driver's orgs overlap with any of the rider's orgs
      RETURN EXISTS (
        SELECT 1 FROM users u_driver
        JOIN users u_rider ON u_rider.id = v_rider_id
        WHERE u_driver.id = p_driver_id
          AND u_driver.organization IS NOT NULL
          AND u_driver.organization != ''
          AND u_rider.organization IS NOT NULL
          AND u_rider.organization != ''
          AND u_rider.organization != 'none'
          AND string_to_array(u_driver.organization, ',') && string_to_array(u_rider.organization, ',')
      );

    WHEN 'community' THEN
      IF v_driver_scope IS NULL THEN RETURN false; END IF;
      IF v_driver_scope NOT IN ('community', 'any') THEN RETURN false; END IF;
      RETURN true;

    ELSE
      RETURN false;
  END CASE;
END;
$$;

COMMIT;
