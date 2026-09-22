"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function sendFriendRequest(friendCode: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
    return { error: error.message };
  }

  revalidatePath("/network");
  return { success: true, name: target.full_name };
}

export async function acceptConnection(connectionId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("connections")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("addressee_id", user.id);

  if (error) {
    return { error: error.message };
  }

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
