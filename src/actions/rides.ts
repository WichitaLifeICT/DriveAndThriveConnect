"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { withinRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { notifyUser, notifyUsers, notifyAdmins } from "@/lib/notify";
import { addDays, formatClockTime, formatLongDate, rideStartsAt, todayInAppZone } from "@/lib/time";
import { logError } from "@/lib/log";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes, randomUUID } from "crypto";
import { notifyEligibleDrivers } from "@/lib/ride-notifications";
import { RIDE_COLUMNS } from "@/lib/constants";
import type { RideRequest } from "@/types/database";

type RideWithRider = RideRequest & {
  rider: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

const VISIBILITIES = ["circle", "organization", "community"] as const;
const MAX_REPEAT_WEEKS = 12;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function str(formData: FormData, key: string): string {
  return ((formData.get(key) as string) || "").trim();
}

function num(formData: FormData, key: string): number | null {
  const value = parseFloat(str(formData, key));
  return Number.isFinite(value) ? value : null;
}

interface RideFields {
  pickup_address: string;
  pickup_place_id: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string;
  dropoff_place_id: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  ride_date: string;
  ride_time: string;
  is_round_trip: boolean;
  return_time: string | null;
  notes: string | null;
  visibility: (typeof VISIBILITIES)[number];
}

/** Validate the ride form shared by create and edit. */
function parseRideFields(formData: FormData): { fields?: RideFields; error?: string } {
  const fields: RideFields = {
    pickup_address: str(formData, "pickup_address"),
    pickup_place_id: str(formData, "pickup_place_id") || null,
    pickup_lat: num(formData, "pickup_lat"),
    pickup_lng: num(formData, "pickup_lng"),
    dropoff_address: str(formData, "dropoff_address"),
    dropoff_place_id: str(formData, "dropoff_place_id") || null,
    dropoff_lat: num(formData, "dropoff_lat"),
    dropoff_lng: num(formData, "dropoff_lng"),
    ride_date: str(formData, "ride_date"),
    ride_time: str(formData, "ride_time"),
    is_round_trip: formData.get("is_round_trip") === "true",
    return_time: str(formData, "return_time") || null,
    notes: str(formData, "notes") || null,
    visibility: str(formData, "visibility") as RideFields["visibility"],
  };

  if (!fields.pickup_address) return { error: "Please enter a pickup location." };
  if (!fields.dropoff_address) return { error: "Please enter a drop-off location." };
  if (fields.pickup_address.length > 300 || fields.dropoff_address.length > 300) {
    return { error: "Addresses must be under 300 characters." };
  }
  if (!DATE_PATTERN.test(fields.ride_date)) return { error: "Please select a date." };
  if (fields.ride_date < todayInAppZone()) return { error: "The ride date can't be in the past." };
  if (!TIME_PATTERN.test(fields.ride_time)) return { error: "Please select a time." };
  if (fields.is_round_trip) {
    if (!fields.return_time || !TIME_PATTERN.test(fields.return_time)) {
      return { error: "Please select a return time for the round trip." };
    }
    if (fields.return_time <= fields.ride_time) {
      return { error: "The return time must be after the pickup time." };
    }
  } else {
    fields.return_time = null;
  }
  if (fields.notes && fields.notes.length > 1000) return { error: "Notes must be under 1,000 characters." };
  if (!VISIBILITIES.includes(fields.visibility)) return { error: "Please choose who can see this request." };

  return { fields };
}

async function getDisplayName(userId: string): Promise<string> {
  const { data } = await createAdminClient().from("users").select("full_name").eq("id", userId).single();
  return data?.full_name || "Someone";
}

export async function createRideRequest(formData: FormData) {
  const { supabase, user } = await requireActiveUser();

  if (!(await withinRateLimit(user.id, "ride_request"))) return { error: RATE_LIMIT_MESSAGE };

  const { fields, error: validationError } = parseRideFields(formData);
  if (!fields) return { error: validationError };

  const separateReturn = fields.is_round_trip && formData.get("separate_return") === "true";
  const repeatWeeks = Math.min(Math.max(parseInt(str(formData, "repeat_weeks") || "1", 10) || 1, 1), MAX_REPEAT_WEEKS);
  const seriesId = repeatWeeks > 1 ? randomUUID() : null;

  // Build every ride up front: one per week, plus a return leg per week
  // when the rider wants the return to be its own ride (possibly a
  // different driver).
  const rows: (RideFields & { id: string; rider_id: string; series_id: string | null; parent_ride_id: string | null })[] = [];
  for (let week = 0; week < repeatWeeks; week++) {
    const date = addDays(fields.ride_date, week * 7);
    const outboundId = randomUUID();
    rows.push({
      ...fields,
      id: outboundId,
      rider_id: user.id,
      ride_date: date,
      is_round_trip: fields.is_round_trip && !separateReturn,
      return_time: separateReturn ? null : fields.return_time,
      series_id: seriesId,
      parent_ride_id: null,
    });
    if (separateReturn && fields.return_time) {
      rows.push({
        ...fields,
        id: randomUUID(),
        rider_id: user.id,
        ride_date: date,
        pickup_address: fields.dropoff_address,
        pickup_place_id: fields.dropoff_place_id,
        pickup_lat: fields.dropoff_lat,
        pickup_lng: fields.dropoff_lng,
        dropoff_address: fields.pickup_address,
        dropoff_place_id: fields.pickup_place_id,
        dropoff_lat: fields.pickup_lat,
        dropoff_lng: fields.pickup_lng,
        ride_time: fields.return_time,
        is_round_trip: false,
        return_time: null,
        notes: fields.notes ? `Return trip. ${fields.notes}` : "Return trip.",
        series_id: seriesId,
        parent_ride_id: outboundId,
      });
    }
  }

  const { error } = await supabase.from("ride_requests").insert(rows);
  if (error) return { error: error.message };

  // Notify drivers about the first occurrence only (outbound + return leg)
  // so a weekly series doesn't flood inboxes.
  const riderName = await getDisplayName(user.id);
  const firstWeek = rows.filter((r) => r.ride_date === fields.ride_date);
  await Promise.all(firstWeek.map((r) => notifyEligibleDrivers(r.id, riderName)));

  revalidatePath("/dashboard");
  revalidatePath("/rides");
  redirect(`/rides/${rows[0].id}`);
}

export async function updateRideRequest(rideId: string, formData: FormData) {
  const { supabase, user } = await requireActiveUser();

  const { data: ride } = await supabase
    .from("ride_requests")
    .select("id, status, rider_id")
    .eq("id", rideId)
    .eq("rider_id", user.id)
    .single();
  if (!ride) return { error: "Ride not found." };
  if (ride.status !== "open") {
    return { error: "Only open rides can be edited. Message your driver or cancel instead." };
  }

  const { fields, error: validationError } = parseRideFields(formData);
  if (!fields) return { error: validationError };

  const { error } = await supabase
    .from("ride_requests")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", rideId)
    .eq("rider_id", user.id);
  if (error) return { error: error.message };

  // Drivers who already offered need to know the details changed
  const { data: offers } = await createAdminClient()
    .from("ride_offers")
    .select("driver_id")
    .eq("ride_request_id", rideId)
    .eq("status", "pending");
  await notifyUsers(
    (offers || []).map((o) => o.driver_id),
    {
      type: "ride_updated",
      title: "A ride you offered on was updated",
      body: `Now ${formatLongDate(fields.ride_date)} at ${formatClockTime(fields.ride_time)}. Please check your offer still works.`,
      link: `/rides/${rideId}`,
      email: {
        details: [
          { label: "Pickup", value: fields.pickup_address },
          { label: "Drop-off", value: fields.dropoff_address },
          { label: "Date", value: formatLongDate(fields.ride_date) },
          { label: "Time", value: formatClockTime(fields.ride_time) },
        ],
        ctaLabel: "Review the ride",
      },
    }
  );

  revalidatePath(`/rides/${rideId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

/** Cancel a ride (optionally every upcoming ride in its weekly series). */
export async function cancelRide(rideId: string, options: { wholeSeries?: boolean } = {}) {
  const { supabase, user } = await requireUser();
  const admin = createAdminClient();

  const { data: ride } = await supabase
    .from("ride_requests")
    .select("id, status, series_id, ride_date, ride_time")
    .eq("id", rideId)
    .eq("rider_id", user.id)
    .single();
  if (!ride) return { error: "Ride not found." };

  let rideIds = [ride.id];
  if (options.wholeSeries && ride.series_id) {
    const { data: series } = await admin
      .from("ride_requests")
      .select("id")
      .eq("series_id", ride.series_id)
      .eq("rider_id", user.id)
      .in("status", ["open", "matched"])
      .gte("ride_date", todayInAppZone());
    rideIds = [...new Set([ride.id, ...(series || []).map((r) => r.id)])];
  } else if (!["open", "matched"].includes(ride.status)) {
    return { error: "This ride can no longer be cancelled." };
  }

  const now = new Date().toISOString();
  const { data: cancelled, error } = await admin
    .from("ride_requests")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .in("id", rideIds)
    .eq("rider_id", user.id)
    .in("status", ["open", "matched"])
    .select("id, ride_date, ride_time");
  if (error) return { error: error.message };

  const { data: affectedOffers } = await admin
    .from("ride_offers")
    .update({ status: "cancelled", updated_at: now })
    .in("ride_request_id", rideIds)
    .in("status", ["pending", "accepted"])
    .select("driver_id, status, ride_request_id");

  const riderName = await getDisplayName(user.id);
  const rideById = new Map((cancelled || []).map((r) => [r.id, r]));
  for (const offer of affectedOffers || []) {
    const r = rideById.get(offer.ride_request_id);
    await notifyUser(offer.driver_id, {
      type: "ride_cancelled",
      title: `${riderName} cancelled a ride`,
      body: r ? `${formatLongDate(r.ride_date)} at ${formatClockTime(r.ride_time)} is cancelled.` : "A ride you offered on was cancelled.",
      link: `/rides/${offer.ride_request_id}`,
      // A driver who was matched may already be planning to leave
      forceEmail: true,
    });
  }

  revalidatePath(`/rides/${rideId}`);
  revalidatePath("/dashboard");
  revalidatePath("/rides");
  return { success: true, count: cancelled?.length || 0 };
}

/** Load a ride plus the caller's role on it (rider / accepted driver). */
async function getRideForParticipant(rideId: string, userId: string) {
  const admin = createAdminClient();
  const { data: ride } = await admin
    .from("ride_requests")
    .select("id, rider_id, status, matched_offer_id, ride_date, ride_time, picked_up_at, dropped_off_at, pickup_address, dropoff_address")
    .eq("id", rideId)
    .single();
  if (!ride) return null;

  let driverId: string | null = null;
  if (ride.matched_offer_id) {
    const { data: offer } = await admin
      .from("ride_offers")
      .select("driver_id, status")
      .eq("id", ride.matched_offer_id)
      .eq("ride_request_id", rideId)
      .single();
    if (offer?.status === "accepted") driverId = offer.driver_id;
  }

  const role = ride.rider_id === userId ? "rider" : driverId === userId ? "driver" : null;
  return { ride, driverId, role };
}

/** Pickup / drop-off check-ins by the rider or the matched driver. */
export async function checkIn(rideId: string, stage: "picked_up" | "dropped_off") {
  const { user } = await requireActiveUser();
  const found = await getRideForParticipant(rideId, user.id);
  if (!found || !found.role) return { error: "Ride not found." };
  const { ride, driverId, role } = found;

  if (ride.status !== "matched") return { error: "This ride isn't in progress." };

  const now = new Date().toISOString();
  const update =
    stage === "picked_up"
      ? { picked_up_at: ride.picked_up_at || now, updated_at: now }
      : {
          picked_up_at: ride.picked_up_at || now,
          dropped_off_at: now,
          status: "completed",
          completed_at: now,
          updated_at: now,
        };

  const { error } = await createAdminClient().from("ride_requests").update(update).eq("id", rideId).eq("status", "matched");
  if (error) return { error: error.message };

  const otherParty = role === "rider" ? driverId : ride.rider_id;
  const actorName = await getDisplayName(user.id);
  await notifyUser(otherParty, {
    type: "ride_checkin",
    title: stage === "picked_up" ? `${actorName} checked in: picked up` : `${actorName} checked in: dropped off`,
    body: stage === "picked_up" ? "The ride is under way." : "The ride is complete. Thanks for riding together!",
    link: `/rides/${rideId}`,
    skipEmail: stage === "picked_up",
  });

  revalidatePath(`/rides/${rideId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

/** Rider reports the matched driver never showed up. */
export async function reportNoShow(rideId: string, details?: string) {
  const { user } = await requireActiveUser();
  const found = await getRideForParticipant(rideId, user.id);
  if (!found || found.role !== "rider") return { error: "Ride not found." };
  const { ride, driverId } = found;
  if (ride.status !== "matched" || !ride.matched_offer_id || !driverId) {
    return { error: "This ride doesn't have a matched driver." };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  await admin.from("ride_offers").update({ status: "no_show", updated_at: now }).eq("id", ride.matched_offer_id);

  // Reopen the ride if there's still time for someone else to take it
  const stillUpcoming = rideStartsAt(ride.ride_date, ride.ride_time).getTime() > Date.now() + 30 * 60 * 1000;
  await admin
    .from("ride_requests")
    .update(
      stillUpcoming
        ? { status: "open", matched_offer_id: null, matched_at: null, picked_up_at: null, updated_at: now }
        : { status: "cancelled", cancelled_at: now, updated_at: now }
    )
    .eq("id", rideId);

  await admin.from("reports").insert({
    reporter_id: user.id,
    reported_user_id: driverId,
    ride_request_id: rideId,
    category: "no_show",
    details: details?.trim().slice(0, 4000) || null,
  });

  const riderName = await getDisplayName(user.id);
  await notifyUser(driverId, {
    type: "rider_no_show",
    title: `${riderName} reported that you didn't show up`,
    body: "If this is a mistake, please message the rider or contact an admin.",
    link: `/rides/${rideId}`,
    forceEmail: true,
  });
  await notifyAdmins({
    type: "report_received",
    title: "Driver no-show reported",
    body: `${riderName} reported a no-show.`,
    link: "/admin/reports",
  });
  if (stillUpcoming) await notifyEligibleDrivers(rideId, riderName, [driverId]);

  revalidatePath(`/rides/${rideId}`);
  revalidatePath("/dashboard");
  return { success: true, reopened: stillUpcoming };
}

export async function getMyRideRequests() {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("ride_requests")
    .select(RIDE_COLUMNS)
    .eq("rider_id", user.id)
    .order("ride_date", { ascending: true })
    .order("ride_time", { ascending: true });

  return (data || []) as unknown as RideRequest[];
}

/** Rides where the user is the matched driver, upcoming first. */
export async function getMyDrives() {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: offers } = await admin
    .from("ride_offers")
    .select("ride_request_id")
    .eq("driver_id", user.id)
    .eq("status", "accepted");
  const ids = (offers || []).map((o) => o.ride_request_id);
  if (ids.length === 0) return [];

  const { data } = await admin
    .from("ride_requests")
    .select("id, ride_date, ride_time, pickup_address, dropoff_address, status, rider:users!rider_id(full_name)")
    .in("id", ids)
    .in("status", ["matched"])
    .order("ride_date", { ascending: true })
    .order("ride_time", { ascending: true });
  return data || [];
}

export async function getRideRequest(id: string) {
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("ride_requests")
    .select(`
      ${RIDE_COLUMNS},
      rider:users!rider_id(id, full_name, avatar_url)
    `)
    .eq("id", id)
    .single();

  return data as unknown as RideWithRider | null;
}

/**
 * Contact details for the other person on a matched ride. Phone numbers
 * are only revealed to the rider and the matched driver, and only if the
 * other person allows it.
 */
export async function getRideContacts(rideId: string) {
  const { user } = await requireUser();
  const found = await getRideForParticipant(rideId, user.id);
  if (!found || !found.role || found.ride.status !== "matched") return null;

  const otherId = found.role === "rider" ? found.driverId : found.ride.rider_id;
  if (!otherId) return null;

  const { data: other } = await createAdminClient()
    .from("users")
    .select("full_name, phone, share_phone_when_matched")
    .eq("id", otherId)
    .single();
  if (!other) return null;

  return {
    name: other.full_name,
    phone: other.share_phone_when_matched ? other.phone : null,
    role: found.role === "rider" ? "driver" : "rider",
  };
}

/** Rides this driver can offer on: visibility is enforced by RLS. */
export async function getEligibleRideRequests() {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("ride_requests")
    .select(`
      ${RIDE_COLUMNS},
      rider:users!rider_id(id, full_name, avatar_url)
    `)
    .eq("status", "open")
    .neq("rider_id", user.id)
    .gte("ride_date", todayInAppZone())
    .order("ride_date", { ascending: true })
    .order("ride_time", { ascending: true });

  // Hide riders this user has blocked (RLS already hides the reverse)
  const { data: blocks } = await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id);
  const blocked = new Set((blocks || []).map((b) => b.blocked_id));

  return ((data || []) as unknown as RideWithRider[]).filter((r) => !blocked.has(r.rider_id));
}

// ==================== Trip sharing ====================

/** The rider's current share token, if sharing is on. */
export async function getTripShareToken(rideId: string) {
  const { user } = await requireUser();
  const { data } = await createAdminClient()
    .from("ride_requests")
    .select("share_token")
    .eq("id", rideId)
    .eq("rider_id", user.id)
    .maybeSingle();
  return data?.share_token || null;
}

/** Create (or return) a private link a rider can send to a trusted contact. */
export async function enableTripSharing(rideId: string) {
  const { supabase, user } = await requireUser();
  const { data: ride } = await supabase
    .from("ride_requests")
    .select("id, share_token")
    .eq("id", rideId)
    .eq("rider_id", user.id)
    .single();
  if (!ride) return { error: "Ride not found." };

  let token = ride.share_token;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    const { error } = await createAdminClient().from("ride_requests").update({ share_token: token }).eq("id", rideId);
    if (error) {
      logError("trip-share.enable", error, { rideId });
      return { error: "Couldn't create a share link." };
    }
  }
  revalidatePath(`/rides/${rideId}`);
  return { token };
}

export async function disableTripSharing(rideId: string) {
  const { supabase, user } = await requireUser();
  const { data: ride } = await supabase
    .from("ride_requests")
    .select("id")
    .eq("id", rideId)
    .eq("rider_id", user.id)
    .single();
  if (!ride) return { error: "Ride not found." };
  await createAdminClient().from("ride_requests").update({ share_token: null }).eq("id", rideId);
  revalidatePath(`/rides/${rideId}`);
  return { success: true };
}

/** Public trip status for a share link (no sign-in required). */
export async function getSharedTrip(token: string) {
  if (!token || token.length < 16) return null;
  const admin = createAdminClient();
  const { data: ride } = await admin
    .from("ride_requests")
    .select("id, rider_id, status, matched_offer_id, ride_date, ride_time, pickup_address, dropoff_address, picked_up_at, dropped_off_at, updated_at, rider:users!rider_id(full_name)")
    .eq("share_token", token)
    .single();
  if (!ride) return null;

  let driver: { full_name: string | null } | null = null;
  if (ride.matched_offer_id) {
    const { data: offer } = await admin
      .from("ride_offers")
      .select("driver:users!driver_id(full_name)")
      .eq("id", ride.matched_offer_id)
      .single();
    driver = (offer?.driver as unknown as { full_name: string | null }) || null;
  }

  const firstName = (name: string | null | undefined) => (name || "").split(" ")[0] || null;
  const rider = ride.rider as unknown as { full_name: string | null } | null;
  return {
    status: ride.status,
    rideDate: ride.ride_date,
    rideTime: ride.ride_time,
    pickupAddress: ride.pickup_address,
    dropoffAddress: ride.dropoff_address,
    pickedUpAt: ride.picked_up_at,
    droppedOffAt: ride.dropped_off_at,
    updatedAt: ride.updated_at,
    riderFirstName: firstName(rider?.full_name),
    driverFirstName: firstName(driver?.full_name),
  };
}

// ==================== Stats ====================

export async function getDashboardStats() {
  const { supabase, user } = await requireUser();

  const { data: rides } = await supabase
    .from("ride_requests")
    .select("status")
    .eq("rider_id", user.id);

  const all = rides || [];
  const total = all.length;
  const completed = all.filter((r) => r.status === "completed").length;
  const matched = all.filter((r) => r.status === "matched").length;
  const cancelled = all.filter((r) => r.status === "cancelled" || r.status === "expired").length;
  const open = all.filter((r) => r.status === "open").length;
  const nonCancelled = total - cancelled;
  const completionRate = nonCancelled > 0 ? Math.round((completed / nonCancelled) * 100) : 0;

  return { total, completed, matched, cancelled, open, completionRate };
}

// Every user sees these stats, so only surface places requested by at
// least this many different riders — otherwise one rider's home address
// would show up as a "popular" pickup.
const MIN_DISTINCT_RIDERS = 3;

export async function getPopularRoutes() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: rides } = await admin
    .from("ride_requests")
    .select("pickup_address, dropoff_address, rider_id");

  if (!rides || rides.length === 0) {
    return { routes: [], topPickups: [], topDropoffs: [] };
  }

  // Aggregate routes (pickup → dropoff pairs)
  const routeCounts: Record<string, { pickup: string; dropoff: string; count: number }> = {};
  const pickupCounts: Record<string, number> = {};
  const dropoffCounts: Record<string, number> = {};
  const routeRiders: Record<string, Set<string>> = {};
  const pickupRiders: Record<string, Set<string>> = {};
  const dropoffRiders: Record<string, Set<string>> = {};

  for (const ride of rides) {
    // Use first part of address (before comma) for cleaner grouping
    const pickupShort = ride.pickup_address.split(",")[0].trim();
    const dropoffShort = ride.dropoff_address.split(",")[0].trim();
    const routeKey = `${pickupShort}|||${dropoffShort}`;

    if (!routeCounts[routeKey]) {
      routeCounts[routeKey] = { pickup: pickupShort, dropoff: dropoffShort, count: 0 };
    }
    routeCounts[routeKey].count++;

    pickupCounts[pickupShort] = (pickupCounts[pickupShort] || 0) + 1;
    dropoffCounts[dropoffShort] = (dropoffCounts[dropoffShort] || 0) + 1;

    (routeRiders[routeKey] ??= new Set()).add(ride.rider_id);
    (pickupRiders[pickupShort] ??= new Set()).add(ride.rider_id);
    (dropoffRiders[dropoffShort] ??= new Set()).add(ride.rider_id);
  }

  const routes = Object.entries(routeCounts)
    .filter(([key]) => routeRiders[key].size >= MIN_DISTINCT_RIDERS)
    .map(([, route]) => route)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topPickups = Object.entries(pickupCounts)
    .filter(([address]) => pickupRiders[address].size >= MIN_DISTINCT_RIDERS)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([address, count]) => ({ address, count }));

  const topDropoffs = Object.entries(dropoffCounts)
    .filter(([address]) => dropoffRiders[address].size >= MIN_DISTINCT_RIDERS)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([address, count]) => ({ address, count }));

  return { routes, topPickups, topDropoffs };
}
