"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { withinRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function getDisplayName(userId: string): Promise<string> {
  const { data } = await createAdminClient().from("users").select("full_name").eq("id", userId).single();
  return data?.full_name || "Someone";
}

export async function sendFriendRequest(friendCode: string) {
  const { supabase, user } = await requireActiveUser();

  if (!(await withinRateLimit(user.id, "friend_request"))) return { error: RATE_LIMIT_MESSAGE };

  // Look up user by friend code (not readable by other users directly)
  const { data: target } = await createAdminClient()
    .from("users")
    .select("id, full_name")
    .eq("friend_code", friendCode.toUpperCase().trim())
    .single();

  if (!target) {
    return { error: "No user found with that friend code." };
  }

  if (target.id === user.id) {
    return { error: "You can't connect with yourself." };
  }

  // Check for existing connection in either direction
  const { data: existing } = await supabase
    .from("connections")
    .select("id, status")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") {
      return { error: "You're already connected with this user." };
    }
    if (existing.status === "pending") {
      return { error: "A connection request already exists." };
    }
  }

  const { error } = await supabase.from("connections").insert({
    requester_id: user.id,
    addressee_id: target.id,
    status: "pending",
  });

  if (error) {
    // Blocked either way, or suspended: don't reveal which
    if (error.code === "42501") return { error: "No user found with that friend code." };
    return { error: error.message };
  }

  await notifyUser(target.id, {
    type: "connection_request",
    title: `${await getDisplayName(user.id)} wants to connect`,
    body: "Accept to share rides with each other.",
    link: "/network",
  });

  revalidatePath("/network");
  return { success: true, name: target.full_name };
}

export async function acceptConnection(connectionId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accepted, error } = await supabase
    .from("connections")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("addressee_id", user.id)
    .select("requester_id");

  if (error) {
    return { error: error.message };
  }

  await notifyUser(accepted?.[0]?.requester_id, {
    type: "connection_accepted",
    title: `${await getDisplayName(user.id)} accepted your connection request`,
    body: "You can now see each other's circle ride requests.",
    link: "/network",
    skipEmail: true,
  });

  revalidatePath("/network");
  return { success: true };
}

export async function declineConnection(connectionId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("connections")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("addressee_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/network");
  return { success: true };
}

/** Remove a connection (either person can). */
export async function removeConnection(connectionId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("id", connectionId)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  if (error) return { error: error.message };
  revalidatePath("/network");
  return { success: true };
}

export async function getConnections() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("connections")
    .select(`
      *,
      requester:users!requester_id(id, full_name, avatar_url, role),
      addressee:users!addressee_id(id, full_name, avatar_url, role)
    `)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });

  return (data || []).map((conn) => {
    const other = conn.requester_id === user.id ? conn.addressee : conn.requester;
    return {
      connectionId: conn.id,
      ...other,
    };
  });
}

export async function getPendingRequests() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("connections")
    .select(`
      *,
      requester:users!requester_id(id, full_name, avatar_url, role)
    `)
    .eq("addressee_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return data || [];
}
