import { createServerClient } from "@/lib/supabase/server";
import { getRideRequest } from "@/actions/rides";
import { getOffersForRide } from "@/actions/offers";
import { getReviewForRide, getDriverRatings } from "@/actions/reviews";
import { redirect } from "next/navigation";
import { RideDetailClient } from "@/components/rides/ride-detail-client";

export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ride = await getRideRequest(id);
  if (!ride) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Ride not found.</p>
      </div>
    );
  }

  const offers = await getOffersForRide(id);
  const isRider = ride.rider_id === user.id;
  const existingOffer = offers.find((o) => o.driver_id === user.id);

  // Fetch existing review for this ride (if rider and completed)
  let existingReview = null;
  if (isRider && ride.status === "completed") {
    existingReview = await getReviewForRide(id);
  }

  // Fetch driver ratings for all offering drivers
  const driverIds = [...new Set(offers.map((o) => o.driver_id))];
  const driverRatings = await getDriverRatings(driverIds);

  // Find the accepted driver ID for review purposes
  const acceptedOffer = offers.find((o) => o.status === "accepted");

  return (
    <RideDetailClient
      ride={ride}
      offers={offers}
      isRider={isRider}
      currentUserId={user.id}
      existingOffer={existingOffer || null}
      existingReview={existingReview}
      driverRatings={driverRatings}
      acceptedDriverId={acceptedOffer?.driver_id || null}
    />
  );
}
