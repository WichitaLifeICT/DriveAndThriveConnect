import "server-only";
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { escapeHtml } from "@/lib/html";
import { appUrl } from "@/lib/app-url";
import { logError, logInfo } from "@/lib/log";

export interface EmailContent {
  /** Heading inside the email */
  heading: string;
  /** Plain-text paragraphs (escaped for you) */
  paragraphs?: string[];
  /** Label/value rows shown in a box (values escaped for you) */
  details?: { label: string; value: string }[];
  /** App-relative link for the button, e.g. "/rides/123" */
  link?: string;
  ctaLabel?: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

/** Render the standard Drive & Thrive email layout. */
export function renderEmail(recipientName: string | null, content: EmailContent): string {
  const paragraphs = (content.paragraphs || [])
    .map((p) => `<p style="color: #374151; font-size: 16px; line-height: 1.5;">${escapeHtml(p)}</p>`)
    .join("");

  const details = content.details?.length
    ? `<div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          ${content.details
            .map(
              (d) => `<tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 110px; vertical-align: top;">${escapeHtml(d.label)}</td>
                <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${escapeHtml(d.value)}</td>
              </tr>`
            )
            .join("")}
        </table>
      </div>`
    : "";

  const button = content.link
    ? `<a href="${escapeHtml(appUrl(content.link))}" style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">
        ${escapeHtml(content.ctaLabel || "Open Drive & Thrive Connect")}
      </a>`
    : "";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0d9488; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Drive &amp; Thrive Connect</h1>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #374151; font-size: 16px; margin-top: 0;">Hi ${escapeHtml(recipientName || "there")},</p>
        <p style="color: #111827; font-size: 17px; font-weight: 600;">${escapeHtml(content.heading)}</p>
        ${paragraphs}
        ${details}
        ${button}
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          You can turn off email notifications on your profile page. Safety and account emails are always sent.
        </p>
      </div>
    </div>
  `;
}

/** Send emails in batches. Never throws; failures are logged. */
export async function sendEmails(emails: OutgoingEmail[]): Promise<void> {
  if (emails.length === 0) return;
  const resend = getResend();
  if (!resend) {
    logInfo("email.skipped", { reason: "RESEND_API_KEY not set", count: emails.length });
    return;
  }
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100).map((e) => ({ from: FROM_EMAIL, ...e }));
    try {
      const { error } = await resend.batch.send(chunk);
      if (error) logError("email.send", error, { count: chunk.length });
    } catch (err) {
      logError("email.send", err, { count: chunk.length });
    }
  }
}
