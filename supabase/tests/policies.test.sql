-- ============================================================
-- Access-control tests for the RLS policies and column grants.
-- Run with supabase/tests/run.sh (applies the stub + all migrations to a
-- throwaway database first). Each check runs as the `authenticated` role
-- with auth.uid() set to the given user, like a request through the
-- Supabase API would.
-- ============================================================

\set ON_ERROR_STOP 1
SET client_min_messages = warning;

CREATE TABLE pg_temp.results (label TEXT, passed BOOLEAN, detail TEXT);

-- Run a statement as a user; expect it to succeed (true) or fail (false)
CREATE FUNCTION pg_temp.check(p_user UUID, p_label TEXT, p_sql TEXT, p_expect_ok BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_ok BOOLEAN;
  v_err TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE p_sql;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
    v_err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO pg_temp.results VALUES (p_label, v_ok = p_expect_ok, v_err);
END;
$$;

-- Run a count query as a user; expect a given number of rows
CREATE FUNCTION pg_temp.check_count(p_user UUID, p_label TEXT, p_sql TEXT, p_expected INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
  v_err TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO v_count;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO pg_temp.results
  VALUES (p_label, v_count IS NOT DISTINCT FROM p_expected,
          COALESCE(v_err, 'got ' || v_count || ', expected ' || p_expected));
END;
$$;

BEGIN;

-- Only the final report is printed
\o /dev/null

-- ---------- Fixtures ----------
-- a=alice (rider), b=bob (driver), c=carol, e=eve (attacker), v=vic (vetted driver)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'alice@test', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test',   '{"full_name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test', '{"full_name":"Carol"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'vic@test',   '{"full_name":"Vic"}');
UPDATE public.users SET invite_token = 'alicetoken' WHERE email = 'alice@test';

-- Eve tries the old invited_by trick against Carol and uses Alice's real
-- invite token; she also picks an organization at signup.
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT '00000000-0000-0000-0000-00000000000e', 'eve@test',
  jsonb_build_object(
    'full_name', 'Eve',
    'invited_by', '00000000-0000-0000-0000-00000000000c',
    'invite_token', 'alicetoken',
    'organization_ids', (SELECT id::text FROM public.organizations WHERE name = 'Hope CDC')
  );

INSERT INTO public.connections (requester_id, addressee_id, status) VALUES
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'accepted');

INSERT INTO public.ride_requests (id, rider_id, pickup_address, dropoff_address, ride_date, ride_time, visibility)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '1 Home St', 'Clinic', current_date + 7, '09:00', 'circle'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   '1 Home St', 'Store', current_date + 7, '10:00', 'organization'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a',
   '1 Home St', 'Old', current_date - 3, '10:00', 'circle');

INSERT INTO public.user_organizations (user_id, organization_id, status)
SELECT '00000000-0000-0000-0000-00000000000a', id, 'approved' FROM public.organizations WHERE name = 'Hope CDC';
INSERT INTO public.user_organizations (user_id, organization_id, status)
SELECT '00000000-0000-0000-0000-0000000000f1', id, 'approved' FROM public.organizations WHERE name = 'Hope CDC';
INSERT INTO public.vetted_driver_status (user_id, status, driver_scope, license_expires_on, insurance_expires_on)
VALUES ('00000000-0000-0000-0000-0000000000f1', 'approved', 'any', current_date + 30, current_date + 30);

-- ---------- Signup trigger ----------
INSERT INTO pg_temp.results
SELECT 'invite token connects to inviter',
  EXISTS (SELECT 1 FROM public.connections WHERE requester_id = '00000000-0000-0000-0000-00000000000a'
          AND addressee_id = '00000000-0000-0000-0000-00000000000e' AND status = 'accepted'), NULL;
INSERT INTO pg_temp.results
SELECT 'invited_by user id is ignored',
  NOT EXISTS (SELECT 1 FROM public.connections WHERE requester_id = '00000000-0000-0000-0000-00000000000c'), NULL;
INSERT INTO pg_temp.results
SELECT 'signup organization becomes membership',
  (SELECT organization FROM public.users WHERE email = 'eve@test') = 'Hope CDC', NULL;

-- ---------- Users ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user cannot set is_admin',
  $$UPDATE users SET is_admin = true WHERE id = auth.uid()$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user cannot set organization',
  $$UPDATE users SET organization = 'X' WHERE id = auth.uid()$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user cannot unsuspend self',
  $$UPDATE users SET suspended_at = NULL WHERE id = auth.uid()$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user can edit own name',
  $$UPDATE users SET full_name = 'Eve 2' WHERE id = auth.uid()$$, true);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user cannot read emails',
  $$SELECT email FROM users$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user cannot read phones',
  $$SELECT phone FROM users$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user can read public profile',
  $$SELECT id, full_name, avatar_url, role FROM users$$, true);

-- ---------- Organizations ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user cannot join org directly',
  $$INSERT INTO user_organizations (user_id, organization_id, status)
    SELECT auth.uid(), id, 'approved' FROM organizations WHERE name = 'Family Promise'$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'user cannot create organizations',
  $$INSERT INTO organizations (name) VALUES ('Fake Org')$$, false);

-- ---------- Connections ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'cannot insert accepted connection',
  $$INSERT INTO connections (requester_id, addressee_id, status) VALUES (auth.uid(), '00000000-0000-0000-0000-00000000000c', 'accepted')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'can send pending request',
  $$INSERT INTO connections (requester_id, addressee_id, status) VALUES (auth.uid(), '00000000-0000-0000-0000-00000000000c', 'pending')$$, true);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000c', 'addressee cannot rewrite requester',
  $$UPDATE connections SET requester_id = '00000000-0000-0000-0000-00000000000b' WHERE addressee_id = auth.uid()$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000c', 'addressee can decline',
  $$UPDATE connections SET status = 'declined' WHERE addressee_id = auth.uid()$$, true);

-- ---------- Vetting ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'cannot self-approve vetting',
  $$INSERT INTO vetted_driver_status (user_id, status, driver_scope) VALUES (auth.uid(), 'approved', 'any')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'cannot insert vetting directly',
  $$INSERT INTO vetted_driver_status (user_id, driver_scope) VALUES (auth.uid(), 'any')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'cannot call get_connections',
  $$SELECT get_connections('00000000-0000-0000-0000-00000000000a')$$, false);

-- ---------- Ride visibility ----------
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000b', 'connected driver sees circle ride',
  $$SELECT 1 FROM ride_requests WHERE id = '10000000-0000-0000-0000-000000000001'$$, 1);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000c', 'stranger cannot see circle ride',
  $$SELECT 1 FROM ride_requests WHERE id = '10000000-0000-0000-0000-000000000001'$$, 0);
SELECT pg_temp.check_count('00000000-0000-0000-0000-0000000000f1', 'vetted same-org driver sees org ride',
  $$SELECT 1 FROM ride_requests WHERE id = '10000000-0000-0000-0000-000000000002'$$, 1);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000e', 'unvetted same-org user cannot see org ride',
  $$SELECT 1 FROM ride_requests WHERE id = '10000000-0000-0000-0000-000000000002'$$, 0);

UPDATE public.users SET role = 'driver' WHERE email IN ('bob@test', 'vic@test', 'carol@test');
INSERT INTO pg_temp.results
SELECT 'circle ride notifies only connected drivers',
  (SELECT array_agg(user_id) FROM public.eligible_drivers_for_ride('10000000-0000-0000-0000-000000000001'))
    = ARRAY['00000000-0000-0000-0000-00000000000b'::uuid], NULL;
INSERT INTO pg_temp.results
SELECT 'org ride notifies only vetted same-org drivers',
  (SELECT array_agg(user_id) FROM public.eligible_drivers_for_ride('10000000-0000-0000-0000-000000000002'))
    = ARRAY['00000000-0000-0000-0000-0000000000f1'::uuid], NULL;
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'clients cannot list eligible drivers',
  $$SELECT eligible_drivers_for_ride('10000000-0000-0000-0000-000000000001')$$, false);

SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'driver cannot read trip share token',
  $$SELECT share_token FROM ride_requests$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'rider cannot set own share token directly',
  $$UPDATE ride_requests SET share_token = 'guessable' WHERE rider_id = auth.uid()$$, false);

-- ---------- Offers ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000c', 'stranger cannot offer',
  $$INSERT INTO ride_offers (ride_request_id, driver_id) VALUES ('10000000-0000-0000-0000-000000000001', auth.uid())$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'cannot insert accepted offer',
  $$INSERT INTO ride_offers (ride_request_id, driver_id, status) VALUES ('10000000-0000-0000-0000-000000000001', auth.uid(), 'accepted')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'connected driver can offer',
  $$INSERT INTO ride_offers (id, ride_request_id, driver_id) VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', auth.uid())$$, true);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'driver cannot accept own offer',
  $$UPDATE ride_offers SET status = 'accepted' WHERE driver_id = auth.uid()$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'rider cannot accept directly (server does it)',
  $$UPDATE ride_offers SET status = 'accepted' WHERE id = '20000000-0000-0000-0000-000000000001'$$, false);

-- ---------- Ride status ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'rider cannot mark ride completed directly',
  $$UPDATE ride_requests SET status = 'completed' WHERE id = '10000000-0000-0000-0000-000000000001'$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'rider cannot set matched_offer_id',
  $$UPDATE ride_requests SET matched_offer_id = '20000000-0000-0000-0000-000000000001' WHERE id = '10000000-0000-0000-0000-000000000001'$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'rider can edit notes',
  $$UPDATE ride_requests SET notes = 'Gate code 12' WHERE id = '10000000-0000-0000-0000-000000000001'$$, true);

-- ---------- Threads, messages ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'cannot open thread with arbitrary user',
  $$INSERT INTO message_threads (ride_request_id, rider_id, driver_id) VALUES ('10000000-0000-0000-0000-000000000001', auth.uid(), '00000000-0000-0000-0000-00000000000c')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'rider cannot thread a non-offerer',
  $$INSERT INTO message_threads (ride_request_id, rider_id, driver_id) VALUES ('10000000-0000-0000-0000-000000000001', auth.uid(), '00000000-0000-0000-0000-00000000000c')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'rider can thread offering driver',
  $$INSERT INTO message_threads (id, ride_request_id, rider_id, driver_id) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', auth.uid(), '00000000-0000-0000-0000-00000000000b')$$, true);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'participant can message',
  $$INSERT INTO messages (thread_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', auth.uid(), 'On my way')$$, true);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'cannot impersonate admin message',
  $$INSERT INTO messages (thread_id, sender_id, content, is_admin_message) VALUES ('30000000-0000-0000-0000-000000000001', auth.uid(), 'I am admin', true)$$, false);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000a', 'unread count for recipient',
  $$SELECT 1 WHERE unread_message_count(auth.uid()) = 1$$, 1);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000e', 'unread count only for self',
  $$SELECT 1 WHERE unread_message_count('00000000-0000-0000-0000-00000000000a') = 0$$, 1);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'can mark thread read',
  $$INSERT INTO message_reads (thread_id, user_id) VALUES ('30000000-0000-0000-0000-000000000001', auth.uid())$$, true);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000a', 'unread clears after read',
  $$SELECT 1 WHERE unread_message_count(auth.uid()) = 0$$, 1);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'cannot mark others'' thread read',
  $$INSERT INTO message_reads (thread_id, user_id) VALUES ('30000000-0000-0000-0000-000000000001', auth.uid())$$, false);

-- ---------- Blocking ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'rider can block driver',
  $$INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (auth.uid(), '00000000-0000-0000-0000-00000000000b')$$, true);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000b', 'blocked driver loses ride visibility',
  $$SELECT 1 FROM ride_requests WHERE id = '10000000-0000-0000-0000-000000000001'$$, 0);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'blocked driver cannot message',
  $$INSERT INTO messages (thread_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', auth.uid(), 'hello?')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'blocked user cannot send connection request',
  $$INSERT INTO connections (requester_id, addressee_id, status) VALUES (auth.uid(), '00000000-0000-0000-0000-00000000000a', 'pending')$$, false);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000b', 'blocked user cannot see block list',
  $$SELECT 1 FROM user_blocks$$, 0);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000e', 'cannot probe others'' blocks',
  $$SELECT 1 WHERE is_blocked_between('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')$$, 0);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000b', 'can check own block status',
  $$SELECT 1 WHERE is_blocked_between(auth.uid(), '00000000-0000-0000-0000-00000000000a')$$, 1);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000e', 'cannot probe others'' ride visibility',
  $$SELECT 1 WHERE can_see_ride_request('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002')$$, 0);
DELETE FROM public.user_blocks;

-- ---------- Reports ----------
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'user can file report',
  $$INSERT INTO reports (reporter_id, reported_user_id, category, details) VALUES (auth.uid(), '00000000-0000-0000-0000-00000000000e', 'harassment', 'x')$$, true);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'cannot file pre-resolved report',
  $$INSERT INTO reports (reporter_id, category, status) VALUES (auth.uid(), 'other', 'resolved')$$, false);
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000e', 'reported user cannot read report',
  $$SELECT 1 FROM reports$$, 0);

-- ---------- Notifications ----------
INSERT INTO public.notifications (user_id, type, title) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'test', 'Hello');
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000e', 'cannot read others'' notifications',
  $$SELECT 1 FROM notifications$$, 0);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000e', 'cannot create notifications',
  $$INSERT INTO notifications (user_id, type, title) VALUES ('00000000-0000-0000-0000-00000000000a', 'x', 'phish')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'can mark own notification read',
  $$UPDATE notifications SET read_at = now() WHERE user_id = auth.uid()$$, true);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'cannot rewrite notification text',
  $$UPDATE notifications SET title = 'changed' WHERE user_id = auth.uid()$$, false);

-- ---------- Suspension ----------
UPDATE public.users SET suspended_at = now() WHERE email = 'bob@test';
SELECT pg_temp.check_count('00000000-0000-0000-0000-00000000000b', 'suspended driver loses ride visibility',
  $$SELECT 1 FROM ride_requests WHERE id = '10000000-0000-0000-0000-000000000001'$$, 0);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'suspended user cannot post ride',
  $$INSERT INTO ride_requests (rider_id, pickup_address, dropoff_address, ride_date, ride_time) VALUES (auth.uid(), 'a', 'b', current_date + 1, '09:00')$$, false);
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000b', 'suspended user cannot message',
  $$INSERT INTO messages (thread_id, sender_id, content) VALUES ('30000000-0000-0000-0000-000000000001', auth.uid(), 'hi')$$, false);
UPDATE public.users SET suspended_at = NULL WHERE email = 'bob@test';

-- ---------- Vetting expiry ----------
UPDATE public.vetted_driver_status SET insurance_expires_on = current_date - 1
WHERE user_id = '00000000-0000-0000-0000-0000000000f1';
SELECT pg_temp.check_count('00000000-0000-0000-0000-0000000000f1', 'lapsed insurance hides org rides',
  $$SELECT 1 FROM ride_requests WHERE id = '10000000-0000-0000-0000-000000000002'$$, 0);
INSERT INTO pg_temp.results
SELECT 'expire_lapsed_vetting returns lapsed driver',
  (SELECT count(*) FROM public.expire_lapsed_vetting()) = 1, NULL;
INSERT INTO pg_temp.results
SELECT 'expire_lapsed_vetting marks driver expired',
  (SELECT status FROM public.vetted_driver_status WHERE user_id = '00000000-0000-0000-0000-0000000000f1') = 'expired', NULL;

-- ---------- Scheduled jobs ----------
INSERT INTO pg_temp.results
SELECT 'expire_stale_rides expires past open rides only',
  (SELECT array_agg(ride_id) FROM public.expire_stale_rides()) = ARRAY['10000000-0000-0000-0000-000000000003'::uuid], NULL;

-- ---------- Rate limiting ----------
INSERT INTO pg_temp.results
SELECT 'rate limit allows up to max then blocks',
  public.check_rate_limit('00000000-0000-0000-0000-00000000000a', 'test', 2, 60)
  AND public.check_rate_limit('00000000-0000-0000-0000-00000000000a', 'test', 2, 60)
  AND NOT public.check_rate_limit('00000000-0000-0000-0000-00000000000a', 'test', 2, 60), NULL;
SELECT pg_temp.check('00000000-0000-0000-0000-00000000000a', 'clients cannot call rate limiter',
  $$SELECT check_rate_limit(auth.uid(), 'test', 100, 60)$$, false);

-- ---------- Report ----------
\o
SELECT CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, label,
       CASE WHEN passed THEN '' ELSE COALESCE(detail, '') END AS detail
FROM pg_temp.results;

DO $$
DECLARE
  v_failed INTEGER;
  v_total INTEGER;
BEGIN
  SELECT count(*) FILTER (WHERE NOT passed), count(*) INTO v_failed, v_total FROM pg_temp.results;
  IF v_failed > 0 THEN
    RAISE EXCEPTION '% of % policy tests failed', v_failed, v_total;
  END IF;
  RAISE NOTICE 'All % policy tests passed', v_total;
END $$;

ROLLBACK;
