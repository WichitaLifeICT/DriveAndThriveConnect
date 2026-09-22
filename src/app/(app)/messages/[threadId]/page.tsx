import { createServerClient } from "@/lib/supabase/server";
import { getThreadMessages } from "@/actions/messages";
import { redirect } from "next/navigation";
import { MessageThreadClient } from "@/components/messages/message-thread-client";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const messages = await getThreadMessages(threadId);

  // Get thread info for header
  const { data: thread } = await supabase
    .from("message_threads")
    .select(`
      *,
      rider:users!rider_id(id, full_name),
      driver:users!driver_id(id, full_name),
      ride_request:ride_requests!ride_request_id(pickup_address, dropoff_address)
    `)
    .eq("id", threadId)
    .single();

  if (!thread) {
    return <div className="text-center py-12 text-gray-500">Thread not found.</div>;
  }

  const otherUser =
    thread.rider_id === user.id ? thread.driver : thread.rider;

  return (
    <MessageThreadClient
      threadId={threadId}
      messages={messages}
      currentUserId={user.id}
      otherUserName={(otherUser as { full_name: string | null })?.full_name || "Unknown"}
      rideInfo={thread.ride_request as { pickup_address: string; dropoff_address: string } | null}
    />
  );
}
