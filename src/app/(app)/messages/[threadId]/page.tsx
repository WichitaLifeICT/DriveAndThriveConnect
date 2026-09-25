import { requireUser } from "@/lib/auth";
import { getThreadMessages } from "@/actions/messages";
import { MessageThreadClient } from "@/components/messages/message-thread-client";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const { supabase, user } = await requireUser();

  const messages = await getThreadMessages(threadId);

  // Get thread info for header
  const { data: thread } = await supabase
    .from("message_threads")
    .select(`
      *,
      rider:users!rider_id(id, full_name),
      driver:users!driver_id(id, full_name),
      ride_request:ride_requests!ride_request_id(id, pickup_address, dropoff_address)
    `)
    .eq("id", threadId)
    .single();

  if (!thread) {
    return <div className="text-center py-12 text-gray-500">Thread not found.</div>;
  }

  const otherUser = (thread.rider_id === user.id ? thread.driver : thread.rider) as {
    id: string;
    full_name: string | null;
  } | null;
  const otherUserId = thread.rider_id === user.id ? thread.driver_id : thread.rider_id;

  const [{ data: myBlock }, { data: blocked }] = await Promise.all([
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", otherUserId).maybeSingle(),
    supabase.rpc("is_blocked_between", { p_a: user.id, p_b: otherUserId }),
  ]);

  const rideRequest = thread.ride_request as { id: string; pickup_address: string; dropoff_address: string } | null;

  return (
    <MessageThreadClient
      threadId={threadId}
      messages={messages}
      currentUserId={user.id}
      otherUserId={otherUserId}
      otherUserName={otherUser?.full_name || "Unknown"}
      rideId={rideRequest?.id || null}
      rideInfo={rideRequest}
      blockedByMe={!!myBlock}
      canSend={!blocked}
    />
  );
}
