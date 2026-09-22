"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyEligibleDrivers } from "@/actions/notifications";

export async function createRideRequest(formData: FormData) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("ride_requests")
    .insert({
      rider_id: user.id,
      pickup_address: formData.get("pickup_address") as string,
      pickup_place_id: (formData.get("pickup_place_id") as string) || null,
      pickup_lat: formData.get("pickup_lat") ? parseFloat(formData.get("pickup_lat") as string) : null,
      pickup_lng: formData.get("pickup_lng") ? parseFloat(formData.get("pickup_lng") as string) : null,
      dropoff_address: formData.get("dropoff_address") as string,
      dropoff_place_id: (formData.get("dropoff_place_id") as string) || null,
      dropoff_lat: formData.get("dropoff_lat") ? parseFloat(formData.get("dropoff_lat") as string) : null,
      dropoff_lng: formData.get("dropoff_lng") ? parseFloat(formData.get("dropoff_lng") as string) : null,
      ride_date: formData.get("ride_date") as string,
      ride_time: formData.get("ride_time") as string,
      is_round_trip: formData.get("is_round_trip") === "true",
      return_time: (formData.get("return_time") as string) || null,
      notes: (formData.get("notes") as string) || null,
      visibility: formData.get("visibility") as string,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  // Send email notifications to eligible drivers (fire and forget)
  if (data) {
    const { data: profile } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .single();

    notifyEligibleDrivers(user.id, {
      riderName: profile?.full_name || "Someone",
      pickupAddress: data.pickup_address,
      dropoffAddress: data.dropoff_address,
      rideDate: data.ride_date,
      rideTime: data.ride_time,
      isRoundTrip: data.is_round_trip,
      returnTime: data.return_time,
      notes: data.notes,
      visibility: data.visibility as "circle" | "organization" | "community",
      rideId: data.id,
    }).catch((err) => console.error("Notification error:", err));
  }

  revalidatePath("/dashboard");
  revalidatePath("/rides");
  redirect("/dashboard");
}

export async function getMyRideRequests() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("ride_requests")
    .select("*")
    .eq("rider_id", user.id)
    .order("ride_date", { ascending: true })
    .order("ride_time", { ascending: true });

  return data || [];
}

export async function getRideRequest(id: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("ride_requests")
    .select(`
      *,
      rider:users!rider_id(id, full_name, avatar_url)
    `)
    .eq("id", id)
    .single();

  return data;
}

export async function getEligibleRideRequests() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Visibility (circle / organization / community, plus the driver's
  // vetting scope) is enforced by the ride_requests RLS policy via
  // can_see_ride_request(), so every row returned here is one this user
  // is allowed to see.
  const { data } = await supabase
    .from("ride_requests")
    .select(`
      *,
      rider:users!rider_id(id, full_name, avatar_url)
    `)
    .eq("status", "open")
    .neq("rider_id", user.id)
    .order("ride_date", { ascending: true })
    .order("ride_time", { ascending: true });

  return data || [];
}

export async function updateRideStatus(
  rideId: string,
  status: "open" | "matched" | "completed" | "cancelled"
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("ride_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", rideId)
    .eq("rider_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/rides/${rideId}`);
  revalidatePath("/dashboard");
  revalidatePath("/rides");
  return { success: true };
}

export async function getDashboardStats() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rides } = await supabase
    .from("ride_requests")
    .select("status")
    .eq("rider_id", user.id);

  const all = rides || [];
  const total = all.length;
  const completed = all.filter((r) => r.status === "completed").length;
  const matched = all.filter((r) => r.status === "matched").length;
  const cancelled = all.filter((r) => r.status === "cancelled").length;
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
