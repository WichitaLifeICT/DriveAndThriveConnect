import { Resend } from "resend";

let client: Resend | null = null;

/** Lazily created so a missing API key doesn't crash unrelated pages. */
export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

/**
 * Sender address. Set EMAIL_FROM once a domain is verified in Resend
 * (see WORK_QUEUE.md). Resend's test sender only delivers to the account
 * owner's own address.
 */
export const FROM_EMAIL =
  process.env.EMAIL_FROM || "Drive & Thrive Connect <onboarding@resend.dev>";
