import Link from "next/link";
import { adminGetThread } from "@/actions/messages";
import { Card } from "@/components/ui/card";
import { AdminThreadClient } from "@/components/admin/admin-thread-client";

type Person = { id: string; full_name: string | null; email: string } | null;

export default async function AdminThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await adminGetThread(id);

  if (!result) {
    return (
      <Card>
        <p className="text-sm text-gray-500 text-center py-8">Conversation not found.</p>
      </Card>
    );
  }

  const { thread, messages } = result;
  const rider = thread.rider as unknown as Person;
  const driver = thread.driver as unknown as Person;
  const ride = thread.ride_request as unknown as {
    id: string;
    pickup_address: string;
    dropoff_address: string;
    ride_date: string;
    ride_time: string;
    status: string;
  } | null;

  return (
    <div className="space-y-4">
      <Link href="/admin/threads" className="text-sm text-gray-500 hover:text-gray-700">
        &larr; All conversations
      </Link>
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-gray-900">
          {rider?.full_name || "Rider"} ↔ {driver?.full_name || "Driver"}
        </h2>
        <p className="text-xs text-gray-500">
          Rider: {rider?.email} · Driver: {driver?.email}
        </p>
        {ride && (
          <p className="text-xs text-gray-500 mt-1">
            Ride {ride.ride_date} {ride.ride_time.slice(0, 5)} · {ride.pickup_address.split(",")[0]} →{" "}
            {ride.dropoff_address.split(",")[0]} · {ride.status}
          </p>
        )}
      </Card>
      <AdminThreadClient
        threadId={id}
        riderId={thread.rider_id}
        messages={messages as unknown as {
          id: string;
          sender_id: string;
          content: string;
          created_at: string;
          is_admin_message: boolean;
          sender: { id: string; full_name: string | null } | null;
        }[]}
      />
    </div>
  );
}
