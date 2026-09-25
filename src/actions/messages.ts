"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser, requireAdmin, requireUser } from "@/lib/auth";
import { withinRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { notifyUser, notifyUsers } from "@/lib/notify";
import { revalidatePath } from "next/cache";

const MAX_MESSAGE_LENGTH = 2000;
// Don't email about every message in a busy conversation
const MESSAGE_EMAIL_COOLDOWN_MINUTES = 15;

export async function getOrCreateThread(rideRequestId: string, driverId: string) {
  const { supabase, user } = await requireActiveUser();

  // Get the ride to find the rider
  const { data: ride } = await supabase
    .from("ride_requests")
    .select("rider_id")
    .eq("id", rideRequestId)
    .single();

  if (!ride) return { error: "Ride not found" };

  const riderId = ride.rider_id;

  // Threads are only between the rider and a driver: the driver can open
  // one on a ride they can see, the rider only with a driver who offered.
  if (user.id !== riderId && user.id !== driverId) {
    return { error: "You can't message on this ride." };
  }
  if (driverId === riderId) return { error: "Invalid driver." };
  if (user.id === riderId) {
    const { data: offer } = await supabase
      .from("ride_offers")
      .select("id")
      .eq("ride_request_id", rideRequestId)
      .eq("driver_id", driverId)
      .maybeSingle();
    if (!offer) return { error: "This driver hasn't offered on your ride." };
  }

  // Check for existing thread
  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("ride_request_id", rideRequestId)
    .eq("rider_id", riderId)
    .eq("driver_id", driverId)
    .maybeSingle();

  if (existing) return { threadId: existing.id };

  // Create new thread
  const { data: newThread, error } = await supabase
    .from("message_threads")
    .insert({
      ride_request_id: rideRequestId,
      rider_id: riderId,
      driver_id: driverId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") return { error: "You can't message this person." };
    return { error: error.message };
  }

  return { threadId: newThread.id };
}

export async function sendMessage(threadId: string, content: string) {
  const { supabase, user } = await requireActiveUser();

  const trimmed = content.trim();
  if (!trimmed) return { error: "Message can't be empty." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { error: "Message is too long." };

  if (!(await withinRateLimit(user.id, "message"))) return { error: RATE_LIMIT_MESSAGE };

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      content: trimmed,
    })
    .select("id, created_at")
    .single();

  if (error) {
    if (error.code === "42501") return { error: "You can't send messages in this conversation." };
    return { error: error.message };
  }

  // Sending counts as reading everything up to now
  await supabase
    .from("message_reads")
    .upsert({ thread_id: threadId, user_id: user.id, last_read_at: message.created_at });

  await notifyRecipient(threadId, user.id, trimmed);

  revalidatePath(`/messages/${threadId}`);
  revalidatePath("/messages");
  return { success: true, message };
}

/** In-app notification for every message; email at most every few minutes. */
async function notifyRecipient(threadId: string, senderId: string, content: string) {
  const admin = createAdminClient();
  const { data: thread } = await admin
    .from("message_threads")
    .select("rider_id, driver_id")
    .eq("id", threadId)
    .single();
  if (!thread) return;

  const recipientId = thread.rider_id === senderId ? thread.driver_id : thread.rider_id;
  const link = `/messages/${threadId}`;

  const since = new Date(Date.now() - MESSAGE_EMAIL_COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { count: recent } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", recipientId)
    .eq("type", "message")
    .eq("link", link)
    .gte("created_at", since);

  const { data: sender } = await admin.from("users").select("full_name").eq("id", senderId).single();
  const senderName = sender?.full_name || "Someone";
  const preview = content.length > 140 ? `${content.slice(0, 140)}…` : content;

  await notifyUser(recipientId, {
    type: "message",
    title: `New message from ${senderName}`,
    body: preview,
    link,
    skipEmail: (recent || 0) > 0,
    email: {
      paragraphs: [`${senderName} wrote: "${preview}"`],
      ctaLabel: "Reply",
    },
  });
}

export async function markThreadRead(threadId: string) {
  const { supabase, user } = await requireUser();
  const now = new Date().toISOString();
  await supabase.from("message_reads").upsert({ thread_id: threadId, user_id: user.id, last_read_at: now });
  // Clear this conversation's message notifications too
  await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .eq("type", "message")
    .eq("link", `/messages/${threadId}`)
    .is("read_at", null);
  return { success: true };
}

export async function getThreadMessages(threadId: string) {
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("messages")
    .select(`
      *,
      sender:users!sender_id(id, full_name, avatar_url)
    `)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  return data || [];
}

export async function getMyThreads() {
  const { supabase, user } = await requireUser();

  const [{ data }, { data: reads }] = await Promise.all([
    supabase
      .from("message_threads")
      .select(`
        *,
        rider:users!rider_id(id, full_name, avatar_url),
        driver:users!driver_id(id, full_name, avatar_url),
        ride_request:ride_requests!ride_request_id(pickup_address, dropoff_address),
        messages(content, created_at, sender_id)
      `)
      .or(`rider_id.eq.${user.id},driver_id.eq.${user.id}`)
      .order("created_at", { ascending: false }),
    supabase.from("message_reads").select("thread_id, last_read_at").eq("user_id", user.id),
  ]);

  const lastRead = new Map((reads || []).map((r) => [r.thread_id, r.last_read_at]));

  const threads = (data || []).map((thread) => {
    const sortedMessages = [...(thread.messages || [])].sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const lastMessage = sortedMessages[0] || null;
    const otherUser =
      thread.rider_id === user.id ? thread.driver : thread.rider;
    const readAt = lastRead.get(thread.id);
    const unreadCount = sortedMessages.filter(
      (m: { sender_id: string; created_at: string }) =>
        m.sender_id !== user.id && (!readAt || m.created_at > readAt)
    ).length;

    return {
      ...thread,
      lastMessage,
      otherUser,
      unreadCount,
    };
  });

  // Most recent conversation first
  return threads.sort((a, b) => {
    const at = a.lastMessage?.created_at || a.created_at;
    const bt = b.lastMessage?.created_at || b.created_at;
    return bt.localeCompare(at);
  });
}

// ==================== Admin ====================

/** Admin view of a conversation (e.g. while reviewing a report). */
export async function adminGetThread(threadId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: thread }, { data: messages }] = await Promise.all([
    admin
      .from("message_threads")
      .select(`
        *,
        rider:users!rider_id(id, full_name, email),
        driver:users!driver_id(id, full_name, email),
        ride_request:ride_requests!ride_request_id(id, pickup_address, dropoff_address, ride_date, ride_time, status)
      `)
      .eq("id", threadId)
      .single(),
    admin
      .from("messages")
      .select("*, sender:users!sender_id(id, full_name)")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);

  return thread ? { thread, messages: messages || [] } : null;
}

export async function adminListThreads(userId?: string) {
  await requireAdmin();
  let query = createAdminClient()
    .from("message_threads")
    .select(`
      id, created_at,
      rider:users!rider_id(id, full_name),
      driver:users!driver_id(id, full_name),
      ride_request:ride_requests!ride_request_id(pickup_address, dropoff_address, ride_date)
    `)
    .order("created_at", { ascending: false })
    .limit(100);
  if (userId) query = query.or(`rider_id.eq.${userId},driver_id.eq.${userId}`);
  const { data } = await query;
  return data || [];
}

/** Post into a conversation as an admin (shown with an Admin label). */
export async function adminSendMessage(threadId: string, content: string) {
  const { user } = await requireAdmin();
  const trimmed = content.trim();
  if (!trimmed) return { error: "Message can't be empty." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { error: "Message is too long." };

  const admin = createAdminClient();
  const { data: thread } = await admin
    .from("message_threads")
    .select("rider_id, driver_id")
    .eq("id", threadId)
    .single();
  if (!thread) return { error: "Conversation not found." };

  const { error } = await admin.from("messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    content: trimmed,
    is_admin_message: true,
  });
  if (error) return { error: error.message };

  await notifyUsers([thread.rider_id, thread.driver_id], {
    type: "admin_message",
    title: "A Drive & Thrive admin posted in your conversation",
    body: trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed,
    link: `/messages/${threadId}`,
    forceEmail: true,
  });

  revalidatePath(`/admin/threads/${threadId}`);
  return { success: true };
}
