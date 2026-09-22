"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createOffer(formData: FormData) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rideRequestId = formData.get("ride_request_id") as string;

  const { error } = await supabase.from("ride_offers").insert({
    ride_request_id: rideRequestId,
    driver_id: user.id,
    suggested_price: (formData.get("suggested_price") as string) || null,
    message: (formData.get("message") as string) || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already made an offer on this ride." };
    }
    return { error: error.message };
  }

  revalidatePath(`/rides/${rideRequestId}`);
  return { success: true };
}

export async function getOffersForRide(rideRequestId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Accept the offer
  const { error: offerError } = await supabase
    .from("ride_offers")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", offerId);

  if (offerError) return { error: offerError.message };

  // Update ride status to matched
  const { error: rideError } = await supabase
    .from("ride_requests")
    .update({
      status: "matched",
      matched_offer_id: offerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rideRequestId)
    .eq("rider_id", user.id);

  if (rideError) return { error: rideError.message };

  // Decline other pending offers
  await supabase
    .from("ride_offers")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("ride_request_id", rideRequestId)
    .neq("id", offerId)
    .eq("status", "pending");

  revalidatePath(`/rides/${rideRequestId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function declineOffer(offerId: string, rideRequestId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("ride_offers")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", offerId);

  if (error) return { error: error.message };

  revalidatePath(`/rides/${rideRequestId}`);
  return { success: true };
}

export async function withdrawOffer(offerId: string, rideRequestId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("ride_offers")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("driver_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/rides/${rideRequestId}`);
  return { success: true };
}
