"use server";

import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getMyNotifications(limit = 50) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export async function markNotificationsRead(ids?: string[]) {
  const { supabase, user } = await requireUser();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (ids && ids.length > 0) query = query.in("id", ids);
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath("/notifications");
  return { success: true };
}

/** Badge counts for the header and bottom navigation. */
export async function getUnreadCounts() {
  const { supabase, user } = await requireUser();
  const [{ count: notifications }, { data: messages }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      .neq("type", "message"),
    supabase.rpc("unread_message_count", { p_user_id: user.id }),
  ]);
  return { notifications: notifications || 0, messages: (messages as number) || 0 };
}
