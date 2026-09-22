import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getUnreadCounts } from "@/actions/notifications";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();

  const { data: profile } = await createAdminClient()
    .from("users")
    .select("suspended_at")
    .eq("id", user.id)
    .single();
  if (profile?.suspended_at) redirect("/suspended");

  const unread = await getUnreadCounts();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-bold text-teal-700">
            Drive & Thrive Connect
          </Link>
          <Link
            href="/notifications"
            className="relative p-1.5 text-gray-500 hover:text-gray-700"
            aria-label={unread.notifications > 0 ? `Notifications (${unread.notifications} unread)` : "Notifications"}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unread.notifications > 0 && (
              <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                {unread.notifications > 99 ? "99+" : unread.notifications}
              </span>
            )}
          </Link>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-4">{children}</main>
      <BottomNav unreadMessages={unread.messages} />
    </div>
  );
}
