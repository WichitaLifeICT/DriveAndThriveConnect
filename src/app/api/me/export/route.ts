import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Download everything the app stores about the signed-in user, as JSON. */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const id = user.id;

  const [profile, organizations, connections, rides, offers, threads, messages, reviewsGiven, reviewsReceived, vetting, reports, blocks, notifications] =
    await Promise.all([
      admin.from("users").select("*").eq("id", id).single(),
      admin.from("user_organizations").select("status, created_at, organization:organizations(name)").eq("user_id", id),
      admin.from("connections").select("*").or(`requester_id.eq.${id},addressee_id.eq.${id}`),
      admin.from("ride_requests").select("*").eq("rider_id", id),
      admin.from("ride_offers").select("*").eq("driver_id", id),
      admin.from("message_threads").select("*").or(`rider_id.eq.${id},driver_id.eq.${id}`),
      admin.from("messages").select("*").eq("sender_id", id),
      admin.from("driver_reviews").select("*").eq("reviewer_id", id),
      admin.from("driver_reviews").select("rating, review_text, created_at").eq("driver_id", id),
      admin.from("vetted_driver_status").select("*").eq("user_id", id),
      admin.from("reports").select("id, category, details, status, created_at").eq("reporter_id", id),
      admin.from("user_blocks").select("*").eq("blocker_id", id),
      admin.from("notifications").select("*").eq("user_id", id),
    ]);

  const body = {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    organizations: organizations.data,
    connections: connections.data,
    ride_requests: rides.data,
    ride_offers: offers.data,
    message_threads: threads.data,
    messages_sent: messages.data,
    reviews_written: reviewsGiven.data,
    reviews_received: reviewsReceived.data,
    driver_vetting: vetting.data,
    reports_filed: reports.data,
    blocked_users: blocks.data,
    notifications: notifications.data,
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="drive-and-thrive-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
