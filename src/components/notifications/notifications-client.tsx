"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/actions/notifications";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils/format";
import { clsx } from "clsx";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationsClient({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const unread = notifications.filter((n) => !n.read_at);

  async function markAllRead() {
    setLoading(true);
    await markNotificationsRead();
    router.refresh();
    setLoading(false);
  }

  // Navigation happens through the link itself; marking read runs in the
  // background so it can't hold up or cancel the navigation.
  function markRead(n: NotificationItem) {
    if (!n.read_at) void markNotificationsRead([n.id]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
        {unread.length > 0 && (
          <Button size="sm" variant="ghost" onClick={markAllRead} loading={loading}>
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">
            You&apos;re all caught up. Updates about your rides and messages will show up here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.link || "/notifications"}
              onClick={() => markRead(n)}
              className="block w-full text-left"
            >
              <Card
                className={clsx(
                  "hover:border-teal-300 transition-colors",
                  !n.read_at && "border-teal-200 bg-teal-50/50"
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={clsx(
                      "mt-1.5 w-2 h-2 rounded-full shrink-0",
                      n.read_at ? "bg-transparent" : "bg-teal-500"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={clsx("text-sm text-gray-900", !n.read_at && "font-medium")}>{n.title}</p>
                    {n.body && <p className="text-sm text-gray-600 mt-0.5">{n.body}</p>}
                    <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.created_at)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Email preferences are on your <Link href="/profile" className="text-teal-600">profile</Link>.
      </p>
    </div>
  );
}
