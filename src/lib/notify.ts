import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderEmail, sendEmails, type EmailContent } from "@/lib/email";
import { logError } from "@/lib/log";

export type NotificationType =
  | "new_ride"
  | "offer_received"
  | "offer_accepted"
  | "offer_declined"
  | "offer_withdrawn"
  | "message"
  | "ride_cancelled"
  | "ride_updated"
  | "ride_expired"
  | "ride_reminder"
  | "ride_completion_prompt"
  | "driver_backed_out"
  | "rider_no_show"
  | "ride_checkin"
  | "vetting_submitted"
  | "org_requested"
  | "vetting_approved"
  | "vetting_denied"
  | "vetting_expiring"
  | "vetting_expired"
  | "org_approved"
  | "org_denied"
  | "connection_request"
  | "connection_accepted"
  | "report_received"
  | "report_update"
  | "account_suspended"
  | "admin_message";

export interface NotifyInput {
  type: NotificationType;
  /** Short line shown in the notification list and as the email subject */
  title: string;
  body?: string;
  /** App-relative link, e.g. "/rides/123" */
  link?: string;
  email?: Omit<EmailContent, "link" | "heading"> & { heading?: string };
  /** Send email even if the user turned email notifications off */
  forceEmail?: boolean;
  /** In-app only */
  skipEmail?: boolean;
}

/**
 * Create in-app notifications and send emails. Never throws — a failed
 * notification must not fail the action that triggered it.
 */
export async function notifyUsers(userIds: (string | null | undefined)[], input: NotifyInput): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;

  try {
    const admin = createAdminClient();

    const { error } = await admin.from("notifications").insert(
      ids.map((user_id) => ({
        user_id,
        type: input.type,
        title: input.title,
        body: input.body || null,
        link: input.link || null,
      }))
    );
    if (error) logError("notify.insert", error, { type: input.type });

    if (input.skipEmail) return;

    const { data: recipients } = await admin
      .from("users")
      .select("email, full_name, notify_email, suspended_at")
      .in("id", ids);

    const emails = (recipients || [])
      .filter((r) => r.email && (input.forceEmail || (r.notify_email && !r.suspended_at)))
      .map((r) => ({
        to: r.email as string,
        subject: input.title,
        html: renderEmail(r.full_name, {
          heading: input.email?.heading || input.title,
          paragraphs: input.email?.paragraphs || (input.body ? [input.body] : []),
          details: input.email?.details,
          link: input.link,
          ctaLabel: input.email?.ctaLabel,
        }),
      }));

    await sendEmails(emails);
  } catch (err) {
    logError("notify", err, { type: input.type });
  }
}

export async function notifyUser(userId: string | null | undefined, input: NotifyInput) {
  return notifyUsers([userId], input);
}

/** Notify every admin (e.g. a new safety report). */
export async function notifyAdmins(input: NotifyInput): Promise<void> {
  try {
    const { data: admins } = await createAdminClient().from("users").select("id").eq("is_admin", true);
    await notifyUsers((admins || []).map((a) => a.id), { ...input, forceEmail: true });
  } catch (err) {
    logError("notify.admins", err, { type: input.type });
  }
}
