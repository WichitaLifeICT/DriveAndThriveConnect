"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { withinRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { notifyAdmins } from "@/lib/notify";
import { REPORT_CATEGORIES } from "@/lib/constants";
import { revalidatePath } from "next/cache";

/**
 * Block another user: they disappear from each other's rides, can't
 * message or send connection requests, and any connection is removed.
 */
export async function blockUser(blockedId: string) {
  const { supabase, user } = await requireUser();
  if (blockedId === user.id) return { error: "You can't block yourself." };

  const { error } = await supabase
    .from("user_blocks")
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { ignoreDuplicates: true });
  if (error) return { error: error.message };

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Remove the connection in either direction
  await admin
    .from("connections")
    .delete()
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${blockedId}),and(requester_id.eq.${blockedId},addressee_id.eq.${user.id})`
    );

  // Close out pending offers between the two on open rides
  const { data: myOpenRides } = await admin
    .from("ride_requests")
    .select("id")
    .eq("rider_id", user.id)
    .eq("status", "open");
  const myRideIds = (myOpenRides || []).map((r) => r.id);
  if (myRideIds.length > 0) {
    await admin
      .from("ride_offers")
      .update({ status: "declined", updated_at: now })
      .in("ride_request_id", myRideIds)
      .eq("driver_id", blockedId)
      .eq("status", "pending");
  }
  const { data: theirOpenRides } = await admin
    .from("ride_requests")
    .select("id")
    .eq("rider_id", blockedId)
    .eq("status", "open");
  const theirRideIds = (theirOpenRides || []).map((r) => r.id);
  if (theirRideIds.length > 0) {
    await admin
      .from("ride_offers")
      .update({ status: "withdrawn", updated_at: now })
      .in("ride_request_id", theirRideIds)
      .eq("driver_id", user.id)
      .eq("status", "pending");
  }

  revalidatePath("/network");
  revalidatePath("/rides");
  return { success: true };
}

export async function unblockUser(blockedId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedId);
  if (error) return { error: error.message };
  revalidatePath("/network");
  revalidatePath("/profile");
  return { success: true };
}

export async function getMyBlocks() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("user_blocks")
    .select("blocked_id, created_at, blocked:users!blocked_id(id, full_name)")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function isBlocked(otherUserId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", otherUserId)
    .maybeSingle();
  return !!data;
}

export interface ReportInput {
  category: string;
  details?: string;
  reportedUserId?: string | null;
  rideRequestId?: string | null;
  threadId?: string | null;
  /** Also block the reported user */
  block?: boolean;
}

/** File a safety or conduct report; every admin is alerted by email. */
export async function fileReport(input: ReportInput) {
  const { supabase, user } = await requireUser();

  if (!(await withinRateLimit(user.id, "report"))) return { error: RATE_LIMIT_MESSAGE };

  const category = REPORT_CATEGORIES.find((c) => c.value === input.category);
  if (!category) return { error: "Please choose what happened." };
  const details = input.details?.trim() || "";
  if (details.length > 4000) return { error: "Please keep the details under 4,000 characters." };
  if (input.reportedUserId === user.id) return { error: "You can't report yourself." };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_user_id: input.reportedUserId || null,
    ride_request_id: input.rideRequestId || null,
    thread_id: input.threadId || null,
    category: category.value,
    details: details || null,
  });
  if (error) return { error: error.message };

  if (input.block && input.reportedUserId) {
    await blockUser(input.reportedUserId);
  }

  const { data: reporter } = await createAdminClient().from("users").select("full_name").eq("id", user.id).single();
  await notifyAdmins({
    type: "report_received",
    title: `${category.value === "safety_incident" ? "SAFETY INCIDENT" : "New report"}: ${category.label}`,
    body: `Filed by ${reporter?.full_name || "a user"}.${details ? ` "${details.slice(0, 200)}"` : ""}`,
    link: "/admin/reports",
  });

  return { success: true };
}

export async function getMyReports() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("reports")
    .select("id, category, status, created_at")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false });
  return data || [];
}
