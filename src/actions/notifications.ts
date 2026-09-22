"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resend, FROM_EMAIL } from "@/lib/resend";

interface RideNotificationData {
  riderName: string;
  pickupAddress: string;
  dropoffAddress: string;
  rideDate: string;
  rideTime: string;
  isRoundTrip: boolean;
  returnTime: string | null;
  notes: string | null;
  visibility: "circle" | "organization" | "community";
  rideId: string;
}

/**
 * Notify eligible drivers about a new ride request via email.
 * Runs after a ride is created — finds drivers who can see the ride
 * based on visibility tier and sends them an email.
 */
export async function notifyEligibleDrivers(
  riderId: string,
  ride: RideNotificationData
) {
  const admin = createAdminClient();

  // Get the rider's info
  const { data: rider } = await admin
    .from("users")
    .select("organization")
    .eq("id", riderId)
    .single();

  // Build list of driver IDs to notify based on visibility
  let driverIds: string[] = [];

  if (ride.visibility === "circle") {
    // Notify direct connections who are drivers
    const { data: connections } = await admin.rpc("get_connections", {
      p_user_id: riderId,
    });
    if (connections && connections.length > 0) {
      const { data: drivers } = await admin
        .from("users")
        .select("id")
        .in("id", connections)
        .eq("role", "driver");
      driverIds = (drivers || []).map((d) => d.id);
    }
  } else if (ride.visibility === "organization") {
    // Notify vetted drivers in the same org(s) with org or any scope
    const riderOrgs =
      rider?.organization
        ?.split(",")
        .filter((o: string) => o && o !== "none") || [];
    if (riderOrgs.length > 0) {
      // Get vetted drivers with org or any scope
      const { data: vettedDrivers } = await admin
        .from("vetted_driver_status")
        .select("user_id")
        .eq("status", "approved")
        .in("driver_scope", ["organization", "any"]);
      const vettedIds = (vettedDrivers || []).map((v) => v.user_id);

      if (vettedIds.length > 0) {
        // Filter to those sharing an org
        const orgFilters = riderOrgs
          .map((o: string) => `organization.ilike.%${o}%`)
          .join(",");
        const { data: orgDrivers } = await admin
          .from("users")
          .select("id")
          .in("id", vettedIds)
          .eq("role", "driver")
          .or(orgFilters)
          .neq("id", riderId);
        driverIds = (orgDrivers || []).map((d) => d.id);
      }
    }

    // Also include direct connections (circle drivers always see circle+ rides)
    const { data: connections } = await admin.rpc("get_connections", {
      p_user_id: riderId,
    });
    if (connections && connections.length > 0) {
      const { data: circleDrivers } = await admin
        .from("users")
        .select("id")
        .in("id", connections)
        .eq("role", "driver");
      const circleIds = (circleDrivers || []).map((d) => d.id);
      driverIds = [...new Set([...driverIds, ...circleIds])];
    }
  } else if (ride.visibility === "community") {
    // Notify all vetted drivers with community or any scope
    const { data: vettedDrivers } = await admin
      .from("vetted_driver_status")
      .select("user_id")
      .eq("status", "approved")
      .in("driver_scope", ["community", "any"]);
    const vettedIds = (vettedDrivers || []).map((v) => v.user_id);

    if (vettedIds.length > 0) {
      const { data: drivers } = await admin
        .from("users")
        .select("id")
        .in("id", vettedIds)
        .eq("role", "driver")
        .neq("id", riderId);
      driverIds = (drivers || []).map((d) => d.id);
    }

    // Also include direct connections
    const { data: connections } = await admin.rpc("get_connections", {
      p_user_id: riderId,
    });
    if (connections && connections.length > 0) {
      const { data: circleDrivers } = await admin
        .from("users")
        .select("id")
        .in("id", connections)
        .eq("role", "driver");
      const circleIds = (circleDrivers || []).map((d) => d.id);
      driverIds = [...new Set([...driverIds, ...circleIds])];
    }
  }

  if (driverIds.length === 0) return;

  // Get driver emails (only those who opted in to email notifications)
  const { data: drivers } = await admin
    .from("users")
    .select("email, full_name")
    .in("id", driverIds)
    .eq("notify_email", true);

  if (!drivers || drivers.length === 0) return;

  // Format date/time nicely
  const dateStr = new Date(ride.rideDate + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" }
  );
  const timeStr = formatTime(ride.rideTime);
  const returnStr = ride.isRoundTrip && ride.returnTime ? formatTime(ride.returnTime) : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://drive-and-thrive-connect.vercel.app";

  // Send emails (batch for efficiency)
  const emails = drivers.map((driver) => ({
    from: FROM_EMAIL,
    to: driver.email,
    subject: `New ride request from ${ride.riderName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0d9488; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Drive & Thrive Connect</h1>
        </div>
        <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 16px; margin-top: 0;">
            Hi ${driver.full_name || "Driver"},
          </p>
          <p style="color: #374151; font-size: 16px;">
            <strong>${ride.riderName}</strong> needs a ride!
          </p>

          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 100px;">Pickup</td>
                <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${ride.pickupAddress}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Dropoff</td>
                <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${ride.dropoffAddress}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date</td>
                <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${dateStr}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Time</td>
                <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${timeStr}</td>
              </tr>
              ${ride.isRoundTrip ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Return</td>
                <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">Round trip${returnStr ? ` — return at ${returnStr}` : ""}</td>
              </tr>
              ` : ""}
              ${ride.notes ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Notes</td>
                <td style="padding: 8px 0; color: #111827; font-size: 14px;">${ride.notes}</td>
              </tr>
              ` : ""}
            </table>
          </div>

          <a href="${appUrl}/rides/${ride.rideId}" style="display: inline-block; background: #0d9488; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">
            View & Offer Ride
          </a>

          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            You received this because you're a driver on Drive & Thrive Connect.
          </p>
        </div>
      </div>
    `,
  }));

  // Send up to 100 emails via batch
  try {
    await resend.batch.send(emails);
  } catch (err) {
    console.error("Failed to send ride notification emails:", err);
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}
