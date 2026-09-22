"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function submitReview(
  rideRequestId: string,
  driverId: string,
  rating: number,
  reviewText?: string
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Validate rating
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { error: "Rating must be a whole number between 1 and 5." };
  }

  // Verify this ride exists and is completed
  const { data: ride } = await supabase
    .from("ride_requests")
    .select("id, rider_id, status")
    .eq("id", rideRequestId)
    .single();

  if (!ride) return { error: "Ride not found." };
  if (ride.status !== "completed") return { error: "You can only review completed rides." };
  if (ride.rider_id !== user.id) return { error: "Only the rider can leave a review." };

  const { error } = await supabase.from("driver_reviews").insert({
    ride_request_id: rideRequestId,
    reviewer_id: user.id,
    driver_id: driverId,
    rating,
    review_text: reviewText?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already reviewed this ride." };
    }
    return { error: error.message };
  }

  revalidatePath(`/rides/${rideRequestId}`);
  return { success: true };
}

export async function getDriverReviews(driverId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("driver_reviews")
    .select(`
      *,
      reviewer:users!reviewer_id(id, full_name, avatar_url)
    `)
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false });

  return data || [];
}

export async function getDriverRating(driverId: string) {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("driver_reviews")
    .select("rating")
    .eq("driver_id", driverId);

  if (!data || data.length === 0) {
    return { average: 0, count: 0 };
  }

  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  return {
    average: Math.round((sum / data.length) * 10) / 10,
    count: data.length,
  };
}

export async function getDriverRatings(driverIds: string[]) {
  const supabase = await createServerClient();

  if (driverIds.length === 0) return {};

  const { data } = await supabase
    .from("driver_reviews")
    .select("driver_id, rating")
    .in("driver_id", driverIds);

  const ratings: Record<string, { average: number; count: number }> = {};

  if (data) {
    // Group by driver_id
    const grouped: Record<string, number[]> = {};
    for (const review of data) {
      if (!grouped[review.driver_id]) grouped[review.driver_id] = [];
      grouped[review.driver_id].push(review.rating);
    }

    for (const [driverId, driverRatings] of Object.entries(grouped)) {
      const sum = driverRatings.reduce((acc, r) => acc + r, 0);
      ratings[driverId] = {
        average: Math.round((sum / driverRatings.length) * 10) / 10,
        count: driverRatings.length,
      };
    }
  }

  return ratings;
}

export async function getReviewForRide(rideRequestId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("driver_reviews")
    .select("*")
    .eq("ride_request_id", rideRequestId)
    .eq("reviewer_id", user.id)
    .single();

  return data;
}
