import Link from "next/link";
import { adminListThreads } from "@/actions/messages";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils/format";

type Person = { id: string; full_name: string | null } | null;

export default async function AdminThreadsPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user: userId } = await searchParams;
  const threads = await adminListThreads(userId);
  const { data: person } = userId
    ? await createAdminClient().from("users").select("full_name").eq("id", userId).single()
    : { data: null };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Conversations{person ? ` with ${person.full_name || "this user"}` : ""}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Open a conversation to review it or post as an admin. Participants are notified when an admin posts.
        </p>
        {userId && (
          <Link href="/admin/threads" className="text-sm text-teal-600 hover:text-teal-700">
            Show all conversations
          </Link>
        )}
      </div>

      {threads.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">No conversations.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => {
            const rider = t.rider as unknown as Person;
            const driver = t.driver as unknown as Person;
            const ride = t.ride_request as unknown as { pickup_address: string; dropoff_address: string; ride_date: string } | null;
            return (
              <Link key={t.id} href={`/admin/threads/${t.id}`}>
                <Card className="hover:border-teal-300 transition-colors mb-2">
                  <p className="text-sm font-medium text-gray-900">
                    {rider?.full_name || "Rider"} (rider) ↔ {driver?.full_name || "Driver"} (driver)
                  </p>
                  {ride && (
                    <p className="text-xs text-gray-500">
                      {ride.ride_date} · {ride.pickup_address.split(",")[0]} → {ride.dropoff_address.split(",")[0]}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">Started {formatRelativeTime(t.created_at)}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
