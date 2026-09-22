"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { withinRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { notifyUser, notifyUsers } from "@/lib/notify";
import { formatClockTime, formatLongDate, rideStartsAt } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { notifyEligibleDrivers } from "@/lib/ride-notifications";

async function getDisplayName(userId: string): Promise<string> {
  const { data } = await createAdminClient().from("users").select("full_name").eq("id", userId).single();
  return data?.full_name || "Someone";
}

function rideWhen(ride: { ride_date: string; ride_time: string }) {
  return `${formatLongDate(ride.ride_date)} at ${formatClockTime(ride.ride_time)}`;
}

export async function createOffer(formData: FormData) {
  const { supabase, user } = await requireActiveUser();

  if (!(await withinRateLimit(user.id, "ride_offer"))) return { error: RATE_LIMIT_MESSAGE };

  const rideRequestId = formData.get("ride_request_id") as string;
  const suggestedPrice = ((formData.get("suggested_price") as string) || "").trim();
  const message = ((formData.get("message") as string) || "").trim();
  if (suggestedPrice.length > 100) return { error: "Suggested price must be under 100 characters." };
  if (message.length > 1000) return { error: "Message must be under 1,000 characters." };

  const { error } = await supabase.from("ride_offers").insert({
    ride_request_id: rideRequestId,
    driver_id: user.id,
    suggested_price: suggestedPrice || null,
    message: message || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already made an offer on this ride." };
    }
    if (error.code === "42501") {
      return { error: "This ride is no longer available." };
    }
    return { error: error.message };
  }

  const { data: ride } = await createAdminClient()
    .from("ride_requests")
    .select("rider_id, ride_date, ride_time")
    .eq("id", rideRequestId)
    .single();
  if (ride) {
    const driverName = await getDisplayName(user.id);
    await notifyUser(ride.rider_id, {
      type: "offer_received",
      title: `${driverName} offered you a ride`,
      body: `For ${rideWhen(ride)}.${suggestedPrice ? ` Suggested: ${suggestedPrice}.` : ""}`,
      link: `/rides/${rideRequestId}`,
      email: {
        paragraphs: [
          `${driverName} offered to drive you on ${rideWhen(ride)}.`,
          ...(message ? [`Their note: "${message}"`] : []),
        ],
        ctaLabel: "Review the offer",
      },
    });
  }

  revalidatePath(`/rides/${rideRequestId}`);
  return { success: true };
}

export async function getOffersForRide(rideRequestId: string) {
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("ride_offers")
    .select(`
      *,
      driver:users!driver_id(id, full_name, avatar_url)
    `)
    .eq("ride_request_id", rideRequestId)
    .order("created_at", { ascending: false });

  return data || [];
}

export async function acceptOffer(offerId: string, rideRequestId: string) {
  const { supabase, user } = await requireActiveUser();
  const admin = createAdminClient();

  // Only the rider can accept, and only a pending offer on this open ride
  const { data: ride } = await supabase
    .from("ride_requests")
    .select("id, status, ride_date, ride_time")
    .eq("id", rideRequestId)
    .eq("rider_id", user.id)
    .single();

  if (!ride) return { error: "Ride not found." };
  if (ride.status !== "open") return { error: "This ride is no longer open." };

  const now = new Date().toISOString();

  // Accepting also updates the ride and other offers, so it runs with the
  // service role after the ownership checks above.
  const { data: accepted, error: offerError } = await admin
    .from("ride_offers")
    .update({ status: "accepted", updated_at: now })
    .eq("id", offerId)
    .eq("ride_request_id", rideRequestId)
    .eq("status", "pending")
    .select("id, driver_id");

  if (offerError) return { error: offerError.message };
  if (!accepted || accepted.length === 0) {
    return { error: "This offer is no longer available." };
  }

  const { error: rideError } = await admin
    .from("ride_requests")
    .update({ status: "matched", matched_offer_id: offerId, matched_at: now, updated_at: now })
    .eq("id", rideRequestId)
    .eq("status", "open");

  if (rideError) return { error: rideError.message };

  const { data: declined } = await admin
    .from("ride_offers")
    .update({ status: "declined", updated_at: now })
    .eq("ride_request_id", rideRequestId)
    .neq("id", offerId)
    .eq("status", "pending")
    .select("driver_id");

  const riderName = await getDisplayName(user.id);
  await notifyUser(accepted[0].driver_id, {
    type: "offer_accepted",
    title: `${riderName} accepted your ride offer`,
    body: `You're driving on ${rideWhen(ride)}.`,
    link: `/rides/${rideRequestId}`,
    email: {
      paragraphs: [
        `${riderName} accepted your offer. You're driving on ${rideWhen(ride)}.`,
        "Open the ride for pickup details and to message the rider. If you can no longer make it, back out from the ride page as early as possible so it can be reopened.",
      ],
      ctaLabel: "View the ride",
    },
  });
  await notifyUsers(
    (declined || []).map((d) => d.driver_id),
    {
      type: "offer_declined",
      title: `${riderName} chose another driver`,
      body: `Thanks for offering on ${rideWhen(ride)}.`,
      link: `/rides/${rideRequestId}`,
      skipEmail: true,
    }
  );

  revalidatePath(`/rides/${rideRequestId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function declineOffer(offerId: string, rideRequestId: string) {
  const { supabase, user } = await requireUser();

  // Only the rider of this ride can decline its offers
  const { data: ride } = await supabase
    .from("ride_requests")
    .select("id, ride_date, ride_time")
    .eq("id", rideRequestId)
    .eq("rider_id", user.id)
    .single();

  if (!ride) return { error: "Ride not found." };

  const { data: declined, error } = await supabase
    .from("ride_offers")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("ride_request_id", rideRequestId)
    .eq("status", "pending")
    .select("driver_id");

  if (error) return { error: error.message };

  const riderName = await getDisplayName(user.id);
  await notifyUsers(
    (declined || []).map((d) => d.driver_id),
    {
      type: "offer_declined",
      title: `${riderName} declined your ride offer`,
      body: `For ${rideWhen(ride)}.`,
      link: `/rides/${rideRequestId}`,
    }
  );

  revalidatePath(`/rides/${rideRequestId}`);
  return { success: true };
}

/** Driver withdraws an offer that hasn't been accepted yet. */
export async function withdrawOffer(offerId: string, rideRequestId: string) {
  const { supabase, user } = await requireUser();

  const { data: withdrawn, error } = await supabase
    .from("ride_offers")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("driver_id", user.id)
    .eq("status", "pending")
    .select("id");

  if (error) return { error: error.message };
  if (!withdrawn || withdrawn.length === 0) return { error: "This offer can't be withdrawn." };

  const { data: ride } = await createAdminClient()
    .from("ride_requests")
    .select("rider_id, ride_date, ride_time")
    .eq("id", rideRequestId)
    .single();
  if (ride) {
    const driverName = await getDisplayName(user.id);
    await notifyUser(ride.rider_id, {
      type: "offer_withdrawn",
      title: `${driverName} withdrew their ride offer`,
      body: `For ${rideWhen(ride)}.`,
      link: `/rides/${rideRequestId}`,
      skipEmail: true,
    });
  }

  revalidatePath(`/rides/${rideRequestId}`);
  return { success: true };
}

/**
 * Matched driver can no longer make it: the ride goes back to open (or is
 * cancelled if it already started) and the rider is told right away.
 */
export async function backOutOfRide(rideRequestId: string, reason?: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: ride } = await admin
    .from("ride_requests")
    .select("id, rider_id, status, matched_offer_id, ride_date, ride_time")
    .eq("id", rideRequestId)
    .single();
  if (!ride || ride.status !== "matched" || !ride.matched_offer_id) return { error: "Ride not found." };

  const { data: offer } = await admin
    .from("ride_offers")
    .select("id, driver_id, status")
    .eq("id", ride.matched_offer_id)
    .single();
  if (!offer || offer.driver_id !== user.id || offer.status !== "accepted") {
    return { error: "You're not the driver for this ride." };
  }

  const now = new Date().toISOString();
  const reopen = rideStartsAt(ride.ride_date, ride.ride_time).getTime() > Date.now();

  await admin.from("ride_offers").update({ status: "backed_out", updated_at: now }).eq("id", offer.id);
  await admin
    .from("ride_requests")
    .update(
      reopen
        ? { status: "open", matched_offer_id: null, matched_at: null, picked_up_at: null, updated_at: now }
        : { status: "cancelled", cancelled_at: now, updated_at: now }
    )
    .eq("id", rideRequestId);

  const driverName = await getDisplayName(user.id);
  const trimmedReason = reason?.trim().slice(0, 500);
  await notifyUser(ride.rider_id, {
    type: "driver_backed_out",
    title: `${driverName} can no longer drive you`,
    body: reopen
      ? `Your ride on ${rideWhen(ride)} is open again and other drivers have been notified.`
      : `Your ride on ${rideWhen(ride)} was cancelled.`,
    link: `/rides/${rideRequestId}`,
    forceEmail: true,
    email: {
      paragraphs: [
        `${driverName} backed out of your ride on ${rideWhen(ride)}.`,
        ...(trimmedReason ? [`Their reason: "${trimmedReason}"`] : []),
        reopen
          ? "Your request is open again and we've let other drivers know."
          : "Because the ride time has passed, the request was cancelled.",
      ],
      ctaLabel: "View your ride",
    },
  });

  if (reopen) await notifyEligibleDrivers(rideRequestId, await getDisplayName(ride.rider_id), [user.id]);

  revalidatePath(`/rides/${rideRequestId}`);
  revalidatePath("/dashboard");
  return { success: true };
}
