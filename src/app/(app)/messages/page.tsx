import { getMyThreads } from "@/actions/messages";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils/format";
import Link from "next/link";

export default async function MessagesPage() {
  const threads = await getMyThreads();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Messages</h2>

      {threads.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm text-gray-500">No messages yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Messages appear when you interact with rides.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Link key={thread.id} href={`/messages/${thread.id}`}>
              <Card className="hover:border-teal-300 transition-colors cursor-pointer mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 font-medium shrink-0">
                    {(thread.otherUser?.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {thread.otherUser?.full_name || "Unknown"}
                      </p>
                      {thread.lastMessage && (
                        <span className="text-xs text-gray-400 shrink-0 ml-2">
                          {formatRelativeTime(thread.lastMessage.created_at)}
                        </span>
                      )}
                    </div>
                    {thread.lastMessage ? (
                      <p className="text-sm text-gray-500 truncate">
                        {thread.lastMessage.content}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No messages yet</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {thread.ride_request?.pickup_address?.split(",")[0]} →{" "}
                      {thread.ride_request?.dropoff_address?.split(",")[0]}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
