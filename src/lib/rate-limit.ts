import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

/** Per-user limits for actions that could be used to spam people. */
export const RATE_LIMITS = {
  ride_request: { max: 10, windowSeconds: 60 * 60 },
  ride_offer: { max: 30, windowSeconds: 60 * 60 },
  message: { max: 60, windowSeconds: 60 * 10 },
  friend_request: { max: 20, windowSeconds: 60 * 60 },
  report: { max: 10, windowSeconds: 60 * 60 },
  vetting_application: { max: 5, windowSeconds: 60 * 60 * 24 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

/**
 * Record an attempt and return true if the user is within the limit.
 * Fails open (allows) if the check itself errors, so an outage in the
 * limiter never blocks legitimate use.
 */
export async function withinRateLimit(userId: string, action: RateLimitedAction): Promise<boolean> {
  const { max, windowSeconds } = RATE_LIMITS[action];
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_user_id: userId,
    p_action: action,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    logError("rate-limit", error, { action });
    return true;
  }
  return data === true;
}

export const RATE_LIMIT_MESSAGE = "You're doing that too often. Please wait a bit and try again.";
