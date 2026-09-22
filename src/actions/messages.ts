"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getOrCreateThread(rideRequestId: string, driverId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get the ride to find the rider
  const { data: ride } = await supabase
    .from("ride_requests")
    .select("rider_id")
    .eq("id", rideRequestId)
    .single();

  if (!ride) return { error: "Ride not found" };

  const riderId = ride.rider_id;

  // Check for existing thread
  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("ride_request_id", rideRequestId)
    .eq("rider_id", riderId)
    .eq("driver_id", driverId)
    .single();

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

  if (error) return { error: error.message };

  return { threadId: newThread.id };
}

export async function sendMessage(threadId: string, content: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    content: content.trim(),
  });

  if (error) return { error: error.message };

  revalidatePath(`/messages/${threadId}`);
  return { success: true };
}

export async function getThreadMessages(threadId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("message_threads")
    .select(`
      *,
      rider:users!rider_id(id, full_name, avatar_url),
      driver:users!driver_id(id, full_name, avatar_url),
      ride_request:ride_requests!ride_request_id(pickup_address, dropoff_address),
      messages(content, created_at, sender_id)
    `)
    .or(`rider_id.eq.${user.id},driver_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  // Get last message for each thread
  return (data || []).map((thread) => {
    const sortedMessages = (thread.messages || []).sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const lastMessage = sortedMessages[0] || null;
    const otherUser =
      thread.rider_id === user.id ? thread.driver : thread.rider;

    return {
      ...thread,
      lastMessage,
      otherUser,
    };
  });
}
