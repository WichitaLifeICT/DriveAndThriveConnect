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

  // Get direct connections
  const { data: directData } = await supabase.rpc("get_connections", {
    p_user_id: user.id,
  });
  const directIds: string[] = directData || [];

  // Check if user is a vetted driver and get their scope
  const { data: vettedStatus } = await supabase
    .from("vetted_driver_status")
    .select("status, driver_scope")
    .eq("user_id", user.id)
    .single();
  const isVetted = vettedStatus?.status === "approved";
  const driverScope = vettedStatus?.driver_scope as string | null;

  // Get current user's organizations for org-tier matching
  const { data: userProfile } = await supabase
    .from("users")
    .select("organization")
    .eq("id", user.id)
    .single();
  const userOrg = userProfile?.organization;
  const userOrgs = userOrg?.split(",").filter((o: string) => o && o !== "none") || [];

  // Find riders sharing any organization (only if vetted, has orgs, and scope allows it)
  let sameOrgRiderIds: string[] = [];
  const scopeAllowsOrg = driverScope === "organization" || driverScope === "any";
  if (isVetted && scopeAllowsOrg && userOrgs.length > 0) {
    // Build OR filter: organization contains any of the driver's orgs
    const orgFilters = userOrgs.map((o: string) => `organization.ilike.%${o}%`).join(",");
    const { data: orgUsers } = await supabase
      .from("users")
      .select("id")
      .or(orgFilters)
      .neq("id", user.id);
    sameOrgRiderIds = (orgUsers || []).map((u) => u.id);
  }

  // Build OR conditions based on driver scope
  const orConditions: string[] = [];

  // Circle rides from direct connections — always allowed regardless of scope
  if (directIds.length > 0) {
    orConditions.push(
      `and(visibility.eq.circle,rider_id.in.(${directIds.join(",")}))`
    );
  }
  // Organization rides — only if vetted and scope includes organization
  if (sameOrgRiderIds.length > 0) {
    orConditions.push(
      `and(visibility.eq.organization,rider_id.in.(${sameOrgRiderIds.join(",")}))`
    );
  }
  // Community rides — only if vetted and scope includes community
  const scopeAllowsCommunity = driverScope === "community" || driverScope === "any";
  if (isVetted && scopeAllowsCommunity) {
    orConditions.push("visibility.eq.community");
  }

  if (orConditions.length === 0) return [];

  const { data } = await supabase
    .from("ride_requests")
    .select(`
      *,
      rider:users!rider_id(id, full_name, avatar_url)
    `)
    .eq("status", "open")
    .neq("rider_id", user.id)
    .or(orConditions.join(","))
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

export async function getPopularRoutes() {
  const admin = createAdminClient();

  const { data: rides } = await admin
    .from("ride_requests")
    .select("pickup_address, dropoff_address");

  if (!rides || rides.length === 0) {
    return { routes: [], topPickups: [], topDropoffs: [] };
  }

  // Aggregate routes (pickup → dropoff pairs)
  const routeCounts: Record<string, { pickup: string; dropoff: string; count: number }> = {};
  const pickupCounts: Record<string, number> = {};
  const dropoffCounts: Record<string, number> = {};

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
  }

  const routes = Object.values(routeCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topPickups = Object.entries(pickupCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([address, count]) => ({ address, count }));

  const topDropoffs = Object.entries(dropoffCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([address, count]) => ({ address, count }));

  return { routes, topPickups, topDropoffs };
}
