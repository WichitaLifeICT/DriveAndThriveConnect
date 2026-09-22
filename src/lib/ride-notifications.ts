import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";
import { formatClockTime, formatLongDate } from "@/lib/time";
import { logError } from "@/lib/log";

/**
 * Tell every driver who can see a newly posted ride about it. Eligibility
 * comes from the same database rule that controls ride visibility.
 */
export async function notifyEligibleDrivers(rideId: string, riderName: string, excludeUserIds: string[] = []) {
  const admin = createAdminClient();

  const [{ data: ride }, { data: drivers, error }] = await Promise.all([
    admin
      .from("ride_requests")
      .select("pickup_address, dropoff_address, ride_date, ride_time, is_round_trip, return_time, notes")
      .eq("id", rideId)
      .single(),
    admin.rpc("eligible_drivers_for_ride", { p_ride_id: rideId }),
  ]);

  if (error) {
    logError("notify.new-ride", error, { rideId });
    return;
  }
  if (!ride || !drivers || drivers.length === 0) return;

  const details = [
    { label: "Pickup", value: ride.pickup_address },
    { label: "Drop-off", value: ride.dropoff_address },
    { label: "Date", value: formatLongDate(ride.ride_date) },
    { label: "Time", value: formatClockTime(ride.ride_time) },
  ];
  if (ride.is_round_trip) {
    details.push({
      label: "Return",
      value: ride.return_time ? `Round trip — return at ${formatClockTime(ride.return_time)}` : "Round trip",
    });
  }
  if (ride.notes) details.push({ label: "Notes", value: ride.notes });

  await notifyUsers(
    (drivers as { user_id: string }[]).map((d) => d.user_id).filter((id) => !excludeUserIds.includes(id)),
    {
      type: "new_ride",
      title: `New ride request from ${riderName}`,
      body: `${formatLongDate(ride.ride_date)} at ${formatClockTime(ride.ride_time)}`,
      link: `/rides/${rideId}`,
      email: {
        heading: `${riderName} needs a ride!`,
        details,
        ctaLabel: "View & Offer Ride",
      },
    }
  );
}
