import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notify";
import { addDays, formatClockTime, formatLongDate, rideStartsAt, todayInAppZone } from "@/lib/time";
import { logError } from "@/lib/log";

const HOUR = 60 * 60 * 1000;
const SOON_REMINDER_HOURS = 3;
const COMPLETION_PROMPT_AFTER_HOURS = 3;
const VETTING_WARNING_DAYS = 30;

type MatchedRide = {
  id: string;
  rider_id: string;
  ride_date: string;
  ride_time: string;
  pickup_address: string;
  dropoff_address: string;
  matched_offer_id: string | null;
  reminder_day_sent_at: string | null;
  reminder_soon_sent_at: string | null;
  completion_prompt_sent_at: string | null;
};

/** Mark open rides whose time has passed as expired and tell the riders. */
export async function expireStaleRides() {
  const { data, error } = await createAdminClient().rpc("expire_stale_rides");
  if (error) {
    logError("cron.expire-rides", error);
    return 0;
  }
  const expired = (data || []) as { ride_id: string; rider_id: string }[];
  for (const ride of expired) {
    await notifyUser(ride.rider_id, {
      type: "ride_expired",
      title: "Your ride request expired without a driver",
      body: "No one was able to take it in time. You can post a new request, and inviting more people to your network helps.",
      link: `/rides/${ride.ride_id}`,
    });
  }
  return expired.length;
}

/** Day-before and few-hours-before reminders, and "did it happen?" prompts. */
export async function sendRideReminders(now = new Date()) {
  const admin = createAdminClient();
  const today = todayInAppZone(now);

  const { data: rides, error } = await admin
    .from("ride_requests")
    .select("id, rider_id, ride_date, ride_time, pickup_address, dropoff_address, matched_offer_id, reminder_day_sent_at, reminder_soon_sent_at, completion_prompt_sent_at")
    .eq("status", "matched")
    .gte("ride_date", addDays(today, -2))
    .lte("ride_date", addDays(today, 1));
  if (error) {
    logError("cron.reminders", error);
    return { day: 0, soon: 0, prompts: 0 };
  }

  let day = 0;
  let soon = 0;
  let prompts = 0;

  for (const ride of (rides || []) as MatchedRide[]) {
    const startsAt = rideStartsAt(ride.ride_date, ride.ride_time).getTime();
    const hoursUntil = (startsAt - now.getTime()) / HOUR;
    const { data: offer } = ride.matched_offer_id
      ? await admin.from("ride_offers").select("driver_id").eq("id", ride.matched_offer_id).single()
      : { data: null };
    const participants = [ride.rider_id, offer?.driver_id];
    const when = `${formatLongDate(ride.ride_date)} at ${formatClockTime(ride.ride_time)}`;
    const details = [
      { label: "When", value: when },
      { label: "Pickup", value: ride.pickup_address },
      { label: "Drop-off", value: ride.dropoff_address },
    ];

    if (!ride.reminder_day_sent_at && ride.ride_date === addDays(today, 1)) {
      for (const userId of participants) {
        await notifyUser(userId, {
          type: "ride_reminder",
          title: `Reminder: ride tomorrow at ${formatClockTime(ride.ride_time)}`,
          body: "Can't make it anymore? Please update the ride now so the other person can plan.",
          link: `/rides/${ride.id}`,
          email: { details, ctaLabel: "View the ride" },
        });
      }
      await admin.from("ride_requests").update({ reminder_day_sent_at: now.toISOString() }).eq("id", ride.id);
      day++;
    }

    if (!ride.reminder_soon_sent_at && hoursUntil > 0 && hoursUntil <= SOON_REMINDER_HOURS) {
      for (const userId of participants) {
        await notifyUser(userId, {
          type: "ride_reminder",
          title: `Ride coming up at ${formatClockTime(ride.ride_time)}`,
          body: `${ride.pickup_address} → ${ride.dropoff_address}`,
          link: `/rides/${ride.id}`,
          email: { details, ctaLabel: "View the ride" },
        });
      }
      await admin.from("ride_requests").update({ reminder_soon_sent_at: now.toISOString() }).eq("id", ride.id);
      soon++;
    }

    if (!ride.completion_prompt_sent_at && hoursUntil < -COMPLETION_PROMPT_AFTER_HOURS) {
      for (const userId of participants) {
        await notifyUser(userId, {
          type: "ride_completion_prompt",
          title: "Did your ride happen?",
          body: `Please mark the ride on ${when} as dropped off, or report a problem.`,
          link: `/rides/${ride.id}`,
        });
      }
      await admin.from("ride_requests").update({ completion_prompt_sent_at: now.toISOString() }).eq("id", ride.id);
      prompts++;
    }
  }

  return { day, soon, prompts };
}

/** Expire lapsed driver approvals and warn drivers before they lapse. */
export async function checkVettingExpiry() {
  const admin = createAdminClient();

  const { data: expired, error } = await admin.rpc("expire_lapsed_vetting");
  if (error) logError("cron.vetting-expire", error);
  for (const row of (expired || []) as { user_id: string }[]) {
    await notifyUser(row.user_id, {
      type: "vetting_expired",
      title: "Your driver approval has expired",
      body: "Your license or insurance on file has expired. Upload current documents to be approved again.",
      link: "/vetting",
      forceEmail: true,
    });
  }

  const warnBefore = addDays(todayInAppZone(), VETTING_WARNING_DAYS);
  const { data: expiring } = await admin
    .from("vetted_driver_status")
    .select("id, user_id, license_expires_on, insurance_expires_on")
    .eq("status", "approved")
    .is("expiry_warning_sent_at", null)
    .or(`license_expires_on.lte.${warnBefore},insurance_expires_on.lte.${warnBefore}`);
  for (const row of expiring || []) {
    const which = [
      row.license_expires_on && row.license_expires_on <= warnBefore ? `license (${formatLongDate(row.license_expires_on)})` : null,
      row.insurance_expires_on && row.insurance_expires_on <= warnBefore ? `insurance (${formatLongDate(row.insurance_expires_on)})` : null,
    ]
      .filter(Boolean)
      .join(" and ");
    await notifyUser(row.user_id, {
      type: "vetting_expiring",
      title: "Your driver documents expire soon",
      body: `Your ${which} on file expires soon. Upload updated documents to keep driving.`,
      link: "/vetting",
      forceEmail: true,
    });
    await admin.from("vetted_driver_status").update({ expiry_warning_sent_at: new Date().toISOString() }).eq("id", row.id);
  }

  return { expired: (expired || []).length, warned: (expiring || []).length };
}
