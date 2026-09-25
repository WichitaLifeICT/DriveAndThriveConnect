import { getMyNotifications } from "@/actions/notifications";
import { NotificationsClient } from "@/components/notifications/notifications-client";

export default async function NotificationsPage() {
  const notifications = await getMyNotifications();
  return <NotificationsClient notifications={notifications} />;
}
