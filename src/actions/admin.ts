"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { notifyUser, notifyUsers } from "@/lib/notify";
import { normalizeUsPhone } from "@/lib/phone";
import { appUrl } from "@/lib/app-url";
import { logError } from "@/lib/log";
import { formatClockTime, formatLongDate } from "@/lib/time";
import { adminSetUserOrganizations } from "@/actions/organizations";
import { revalidatePath } from "next/cache";
import { WICHITA_LOCATIONS, WICHITA_ZIP_NEIGHBORHOODS, extractZip } from "@/lib/wichita-locations";

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

export async function getAllUsers() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  return data || [];
}


/** Map organization names (as the users screen edits them) to ids. */
async function organizationIdsFromNames(names: string): Promise<string[]> {
  const wanted = names
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n && n.toLowerCase() !== "none");
  if (wanted.length === 0) return [];
  const { data } = await createAdminClient().from("organizations").select("id, name").in("name", wanted);
  return (data || []).map((o) => o.id);
}

export async function adminUpdateUserOrg(userId: string, organization: string) {
  await requireAdmin();
  await adminSetUserOrganizations(userId, await organizationIdsFromNames(organization || ""));
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

/**
 * Suspend a user: they're signed out and can't sign in (auth ban), their
 * open rides and offers are cancelled, riders they were driving are told
 * and their rides reopened, and database rules stop them acting.
 */
export async function suspendUser(userId: string, reason?: string) {
  const { user: adminUser } = await requireAdmin();
  if (userId === adminUser.id) return { error: "You can't suspend yourself." };
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("users")
    .update({ suspended_at: now, suspended_reason: reason?.trim() || null, updated_at: now })
    .eq("id", userId);
  if (error) return { error: error.message };

  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (banError) logError("admin.suspend.ban", banError, { userId });

  await admin
    .from("vetted_driver_status")
    .update({ status: "suspended", updated_at: now })
    .eq("user_id", userId)
    .in("status", ["approved", "pending"]);

  // Their open rides are cancelled; drivers who offered are told
  const { data: cancelledRides } = await admin
    .from("ride_requests")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("rider_id", userId)
    .in("status", ["open", "matched"])
    .select("id, ride_date, ride_time");
  const cancelledIds = (cancelledRides || []).map((r) => r.id);
  if (cancelledIds.length > 0) {
    const { data: offers } = await admin
      .from("ride_offers")
      .update({ status: "cancelled", updated_at: now })
      .in("ride_request_id", cancelledIds)
      .in("status", ["pending", "accepted"])
      .select("driver_id");
    await notifyUsers(
      (offers || []).map((o) => o.driver_id),
      {
        type: "ride_cancelled",
        title: "A ride you offered on was cancelled",
        body: "The ride request is no longer available.",
        forceEmail: true,
      }
    );
  }

  // Their pending offers are withdrawn
  await admin
    .from("ride_offers")
    .update({ status: "withdrawn", updated_at: now })
    .eq("driver_id", userId)
    .eq("status", "pending");

  // Rides they were driving go back to open
  const { data: accepted } = await admin
    .from("ride_offers")
    .update({ status: "cancelled", updated_at: now })
    .eq("driver_id", userId)
    .eq("status", "accepted")
    .select("ride_request_id");
  const drivingIds = (accepted || []).map((o) => o.ride_request_id);
  if (drivingIds.length > 0) {
    const { data: reopened } = await admin
      .from("ride_requests")
      .update({ status: "open", matched_offer_id: null, matched_at: null, picked_up_at: null, updated_at: now })
      .in("id", drivingIds)
      .eq("status", "matched")
      .select("id, rider_id, ride_date, ride_time");
    for (const ride of reopened || []) {
      await notifyUser(ride.rider_id, {
        type: "driver_backed_out",
        title: "Your driver is no longer available",
        body: `Your ride on ${formatLongDate(ride.ride_date)} at ${formatClockTime(ride.ride_time)} is open again. Other drivers can now offer.`,
        link: `/rides/${ride.id}`,
        forceEmail: true,
      });
    }
  }

  await notifyUser(userId, {
    type: "account_suspended",
    title: "Your Drive & Thrive Connect account has been suspended",
    body: reason?.trim()
      ? `Reason: ${reason.trim()}. Contact the program admins if you have questions.`
      : "Contact the program admins if you have questions.",
    forceEmail: true,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/reports");
  return { success: true };
}

export async function unsuspendUser(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ suspended_at: null, suspended_reason: null, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { error: error.message };

  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (banError) logError("admin.unsuspend.ban", banError, { userId });

  // Driver approval stays suspended until an admin re-approves it
  revalidatePath("/admin/users");
  return { success: true };
}

// ==================== Reports ====================

export async function adminListReports(status?: "open" | "reviewing" | "resolved") {
  await requireAdmin();
  let query = createAdminClient()
    .from("reports")
    .select(`
      *,
      reporter:users!reporter_id(id, full_name, email, phone),
      reported:users!reported_user_id(id, full_name, email, phone, suspended_at),
      ride:ride_requests!ride_request_id(id, ride_date, ride_time, pickup_address, dropoff_address, status)
    `)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return data || [];
}

export async function adminUpdateReport(reportId: string, status: "open" | "reviewing" | "resolved", notes?: string) {
  const { user } = await requireAdmin();
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("reports")
    .update({
      status,
      admin_notes: notes?.trim() || null,
      resolved_by: status === "resolved" ? user.id : null,
      resolved_at: status === "resolved" ? now : null,
      updated_at: now,
    })
    .eq("id", reportId)
    .select("reporter_id")
    .single();
  if (error) return { error: error.message };

  if (status === "resolved") {
    await notifyUser(data?.reporter_id, {
      type: "report_update",
      title: "Your report has been reviewed",
      body: "Thank you for helping keep the community safe. An admin reviewed your report and took action where needed.",
      skipEmail: true,
    });
  }

  revalidatePath("/admin/reports");
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

/**
 * Create an account for someone. By default they get an invite email to
 * set their own password; a temporary password can be set instead.
 */
export async function adminCreateUser(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const email = ((formData.get("email") as string) || "").trim();
  const password = (formData.get("password") as string) || "";
  const fullName = ((formData.get("full_name") as string) || "").trim();
  const role = formData.get("role") === "driver" ? "driver" : "rider";
  const organization = (formData.get("organization") as string) || "";
  let phone: string | null;
  try {
    phone = normalizeUsPhone(formData.get("phone") as string);
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (!email) return { error: "Email is required." };

  const metadata = { full_name: fullName, phone: phone || undefined };

  let userId: string | undefined;
  if (password) {
    if (password.length < 8) return { error: "Temporary password must be at least 8 characters." };
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) return { error: error.message };
    userId = data.user?.id;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo: appUrl("/auth/callback?next=/reset-password"),
    });
    if (error) return { error: error.message };
    userId = data.user?.id;
  }
  if (!userId) return { error: "Failed to create user" };

  // The signup trigger creates the profile row in the same transaction as
  // the auth user, but retry briefly in case of replication lag.
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: row } = await admin.from("users").select("id").eq("id", userId).maybeSingle();
    if (row) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const { error: updateError } = await admin
    .from("users")
    .update({
      role,
      phone,
      disclaimer_accepted: true,
      disclaimer_accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (updateError) return { error: updateError.message };

  await adminSetUserOrganizations(userId, await organizationIdsFromNames(organization));

  revalidatePath("/admin/users");
  return { success: true, invited: !password };
}

export async function adminEditUser(userId: string, formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const fullName = formData.get("full_name") as string;
  const role = formData.get("role") === "driver" ? "driver" : "rider";
  const organization = (formData.get("organization") as string) || "";
  const email = ((formData.get("email") as string) || "").trim();
  let phone: string | null;
  try {
    phone = normalizeUsPhone(formData.get("phone") as string);
  } catch (err) {
    return { error: (err as Error).message };
  }

  // Update auth first so the profile never shows an email login doesn't use
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { email });
  if (authError) return { error: authError.message };

  const { error } = await admin
    .from("users")
    .update({
      full_name: fullName,
      phone,
      email,
      role,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  await adminSetUserOrganizations(userId, await organizationIdsFromNames(organization));

  revalidatePath("/admin/users");
  return { success: true };
}

// ==================== Impact ====================

/** Ride outcomes for rides dated within [from, to], overall / by org / by month. */
export async function getImpactReport(from: string, to: string) {
  await requireAdmin();
  const { loadImpactRides, buildImpactReport } = await import("@/lib/impact");
  return buildImpactReport(await loadImpactRides(from, to));
}
