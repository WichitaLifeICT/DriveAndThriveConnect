import { NextResponse, type NextRequest } from "next/server";
import { expireStaleRides, sendRideReminders, checkVettingExpiry } from "@/lib/scheduled-jobs";
import { logError, logInfo } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled maintenance, called by Vercel Cron (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const expiredRides = await expireStaleRides();
    const reminders = await sendRideReminders();
    const vetting = await checkVettingExpiry();
    const result = { expiredRides, reminders, vetting };
    logInfo("cron", result);
    return NextResponse.json(result);
  } catch (err) {
    logError("cron", err);
    return NextResponse.json({ error: "Cron run failed" }, { status: 500 });
  }
}
