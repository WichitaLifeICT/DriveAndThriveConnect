"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { WICHITA_LOCATIONS, WICHITA_ZIP_NEIGHBORHOODS, extractZip } from "@/lib/wichita-locations";

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");
  return user;
}

export async function getAdminStats() {
  await requireAdmin();
  const admin = createAdminClient();

  const [users, rides, completedRides, pendingApps, vettedDrivers, activeRides] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }),
    admin.from("ride_requests").select("id", { count: "exact", head: true }),
    admin
      .from("ride_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    admin
      .from("vetted_driver_status")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("vetted_driver_status")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    admin
      .from("ride_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "matched"]),
  ]);

  return {
    totalUsers: users.count || 0,
    totalRides: rides.count || 0,
    completedRides: completedRides.count || 0,
    pendingApplications: pendingApps.count || 0,
    vettedDrivers: vettedDrivers.count || 0,
    activeRides: activeRides.count || 0,
  };
}

export async function getAdminRouteStats() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: rides } = await admin
    .from("ride_requests")
    .select("pickup_address, dropoff_address");

  if (!rides || rides.length === 0) {
    return { routes: [], topPickups: [], topDropoffs: [] };
  }

  const routeCounts: Record<string, { pickup: string; dropoff: string; count: number }> = {};
  const pickupCounts: Record<string, number> = {};
  const dropoffCounts: Record<string, number> = {};

  for (const ride of rides) {
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
    .slice(0, 10);

  const topPickups = Object.entries(pickupCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([address, count]) => ({ address, count }));

  const topDropoffs = Object.entries(dropoffCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([address, count]) => ({ address, count }));

  return { routes, topPickups, topDropoffs };
}

export async function getPendingApplications() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("vetted_driver_status")
    .select(`
      *,
      user:users!user_id(id, full_name, email, avatar_url, role, created_at)
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return data || [];
}

export async function approveDriver(userId: string) {
  const adminUser = await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("vetted_driver_status")
    .update({
      status: "approved",
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/vetting");
  return { success: true };
}

export async function denyDriver(userId: string, notes?: string) {
  const adminUser = await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("vetted_driver_status")
    .update({
      status: "denied",
      admin_notes: notes || null,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/vetting");
  return { success: true };
}

export async function getAllUsers() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  return data || [];
}

export async function adminUpdateUserOrg(userId: string, organization: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({
      organization: organization || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}

export async function toggleAdmin(userId: string, makeAdmin: boolean) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({
      is_admin: makeAdmin,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}

export async function suspendUser(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  // Mark any vetted status as suspended
  await admin
    .from("vetted_driver_status")
    .update({
      status: "suspended",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  revalidatePath("/admin/users");
  return { success: true };
}

export async function adminConnectUsers(userId1: string, userId2: string) {
  await requireAdmin();
  const admin = createAdminClient();

  if (userId1 === userId2) {
    return { error: "Cannot connect a user to themselves." };
  }

  // Check if connection already exists in either direction
  const { data: existing } = await admin
    .from("connections")
    .select("id, status")
    .or(
      `and(requester_id.eq.${userId1},addressee_id.eq.${userId2}),and(requester_id.eq.${userId2},addressee_id.eq.${userId1})`
    )
    .limit(1);

  if (existing && existing.length > 0) {
    const conn = existing[0];
    if (conn.status === "accepted") {
      return { error: "These users are already connected." };
    }
    // If pending or declined, update to accepted
    const { error } = await admin
      .from("connections")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", conn.id);

    if (error) return { error: error.message };
    revalidatePath("/admin/users");
    return { success: true };
  }

  // Create new accepted connection
  const { error } = await admin.from("connections").insert({
    requester_id: userId1,
    addressee_id: userId2,
    status: "accepted",
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}

export async function getLocationStats() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: rides } = await admin
    .from("ride_requests")
    .select("pickup_address, dropoff_address, rider_id, ride_time");

  // Track which rides matched a preset location
  const matchedPickups = new Set<number>();
  const matchedDropoffs = new Set<number>();

  // Helper to format hour into time window label
  function formatTimeWindow(hour: number): string {
    const windowStart = hour;
    const windowEnd = hour + 1;
    return `${windowStart === 0 ? 12 : windowStart > 12 ? windowStart - 12 : windowStart}${windowStart < 12 ? "am" : "pm"} – ${windowEnd === 0 ? 12 : windowEnd > 12 ? windowEnd - 12 : windowEnd}${windowEnd < 12 ? "am" : "pm"}`;
  }

  // Build stats for each preset location
  const presetStats = WICHITA_LOCATIONS.map((loc) => {
    const fromRiderSet = new Set<string>();
    const toRiderSet = new Set<string>();
    let fromCount = 0;
    let toCount = 0;
    const locTimeWindows: Record<string, number> = {};

    if (rides) {
      for (let i = 0; i < rides.length; i++) {
        const ride = rides[i];
        const locAddr = loc.address.split(",").slice(0, -1).join(",").trim().toLowerCase();
        const pickupNorm = ride.pickup_address.toLowerCase();
        const dropoffNorm = ride.dropoff_address.toLowerCase();

        let matched = false;
        if (pickupNorm.includes(locAddr) || pickupNorm.includes(loc.name.toLowerCase())) {
          fromCount++;
          fromRiderSet.add(ride.rider_id);
          matchedPickups.add(i);
          matched = true;
        }
        if (dropoffNorm.includes(locAddr) || dropoffNorm.includes(loc.name.toLowerCase())) {
          toCount++;
          toRiderSet.add(ride.rider_id);
          matchedDropoffs.add(i);
          matched = true;
        }

        // Track time window for this location
        if (matched && ride.ride_time) {
          const hour = parseInt(ride.ride_time.split(":")[0], 10);
          const label = formatTimeWindow(hour);
          locTimeWindows[label] = (locTimeWindows[label] || 0) + 1;
        }
      }
    }

    const timeBreakdown = Object.entries(locTimeWindows)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    return {
      name: loc.name,
      address: loc.address,
      category: loc.category,
      fromCount,
      toCount,
      fromRiders: fromRiderSet.size,
      toRiders: toRiderSet.size,
      totalRides: fromCount + toCount,
      timeBreakdown,
    };
  });

  // Bucket unmatched rides by neighborhood (zip code)
  const neighborhoods: Record<string, {
    name: string;
    zip: string;
    fromCount: number;
    toCount: number;
    fromRiders: Set<string>;
    toRiders: Set<string>;
  }> = {};

  // Time window buckets
  const timeWindows: Record<string, { fromCount: number; toCount: number }> = {};

  if (rides) {
    for (let i = 0; i < rides.length; i++) {
      const ride = rides[i];

      // Neighborhood bucketing for unmatched pickups
      if (!matchedPickups.has(i)) {
        const zip = extractZip(ride.pickup_address);
        if (zip) {
          const name = WICHITA_ZIP_NEIGHBORHOODS[zip] || `ZIP ${zip}`;
          if (!neighborhoods[zip]) {
            neighborhoods[zip] = { name, zip, fromCount: 0, toCount: 0, fromRiders: new Set(), toRiders: new Set() };
          }
          neighborhoods[zip].fromCount++;
          neighborhoods[zip].fromRiders.add(ride.rider_id);
        }
      }

      // Neighborhood bucketing for unmatched dropoffs
      if (!matchedDropoffs.has(i)) {
        const zip = extractZip(ride.dropoff_address);
        if (zip) {
          const name = WICHITA_ZIP_NEIGHBORHOODS[zip] || `ZIP ${zip}`;
          if (!neighborhoods[zip]) {
            neighborhoods[zip] = { name, zip, fromCount: 0, toCount: 0, fromRiders: new Set(), toRiders: new Set() };
          }
          neighborhoods[zip].toCount++;
          neighborhoods[zip].toRiders.add(ride.rider_id);
        }
      }

      // Time window aggregation (all rides)
      if (ride.ride_time) {
        const hour = parseInt(ride.ride_time.split(":")[0], 10);
        const label = formatTimeWindow(hour);
        if (!timeWindows[label]) {
          timeWindows[label] = { fromCount: 0, toCount: 0 };
        }
        timeWindows[label].fromCount++;
      }
    }
  }

  const neighborhoodStats = Object.values(neighborhoods)
    .map((n) => ({
      name: n.name,
      zip: n.zip,
      fromCount: n.fromCount,
      toCount: n.toCount,
      fromRiders: n.fromRiders.size,
      toRiders: n.toRiders.size,
      totalRides: n.fromCount + n.toCount,
    }))
    .sort((a, b) => b.totalRides - a.totalRides);

  const timeWindowStats = Object.entries(timeWindows)
    .map(([label, counts]) => ({ label, count: counts.fromCount }))
    .sort((a, b) => b.count - a.count);

  return { presetStats, neighborhoodStats, timeWindowStats };
}

export async function applyForVetting(formData: FormData) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("vetted_driver_status").insert({
    user_id: user.id,
    license_attestation: formData.get("license_attestation") === "true",
    insurance_attestation: formData.get("insurance_attestation") === "true",
    driver_scope: (formData.get("driver_scope") as string) || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already submitted an application." };
    }
    return { error: error.message };
  }

  revalidatePath("/vetting");
  return { success: true };
}

export async function getPendingOrgRequests() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("users")
    .select("id, full_name, email, role, organization, pending_organizations")
    .not("pending_organizations", "is", null)
    .neq("pending_organizations", "")
    .order("updated_at", { ascending: false });

  return data || [];
}

export async function approveUserOrg(userId: string, org: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: user } = await admin
    .from("users")
    .select("organization, pending_organizations")
    .eq("id", userId)
    .single();

  if (!user) return { error: "User not found" };

  const approved = (user.organization || "")
    .split(",")
    .map((o: string) => o.trim())
    .filter(Boolean);
  const pending = (user.pending_organizations || "")
    .split(",")
    .map((o: string) => o.trim())
    .filter(Boolean);

  // Move org from pending to approved
  if (!approved.includes(org)) approved.push(org);
  const newPending = pending.filter((o: string) => o !== org);

  const { error } = await admin
    .from("users")
    .update({
      organization: approved.join(",") || null,
      pending_organizations: newPending.length > 0 ? newPending.join(",") : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/organizations");
  revalidatePath("/admin/users");
  return { success: true };
}

export async function denyUserOrg(userId: string, org: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: user } = await admin
    .from("users")
    .select("pending_organizations")
    .eq("id", userId)
    .single();

  if (!user) return { error: "User not found" };

  const pending = (user.pending_organizations || "")
    .split(",")
    .map((o: string) => o.trim())
    .filter(Boolean);

  const newPending = pending.filter((o: string) => o !== org);

  const { error } = await admin
    .from("users")
    .update({
      pending_organizations: newPending.length > 0 ? newPending.join(",") : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/organizations");
  revalidatePath("/admin/users");
  return { success: true };
}

export async function adminCreateUser(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const phone = (formData.get("phone") as string) || "";
  const role = formData.get("role") as "rider" | "driver";
  const organization = (formData.get("organization") as string) || "";

  // Create auth user via admin API
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone,
    },
  });

  if (authError) return { error: authError.message };
  if (!authData.user) return { error: "Failed to create user" };

  // The DB trigger creates the user row; now update role, org, phone
  // Small delay to let trigger fire
  await new Promise((r) => setTimeout(r, 500));

  await admin
    .from("users")
    .update({
      role,
      phone: phone || null,
      organization: organization || null,
      disclaimer_accepted: true,
      disclaimer_accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", authData.user.id);

  revalidatePath("/admin/users");
  return { success: true };
}

export async function adminEditUser(userId: string, formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const fullName = formData.get("full_name") as string;
  const phone = (formData.get("phone") as string) || null;
  const role = formData.get("role") as "rider" | "driver";
  const organization = (formData.get("organization") as string) || null;
  const email = formData.get("email") as string;

  // Update the users table
  const { error } = await admin
    .from("users")
    .update({
      full_name: fullName,
      phone,
      email,
      role,
      organization,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  // Also update email in auth if it changed
  await admin.auth.admin.updateUserById(userId, { email });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function getMyVettingStatus() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("vetted_driver_status")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return data;
}
