import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRideRequest, getRideContacts, getTripShareToken } from "@/actions/rides";
import { getOffersForRide } from "@/actions/offers";
import { getReviewForRide, getDriverRatings } from "@/actions/reviews";
import { isBlocked } from "@/actions/safety";
import { todayInAppZone } from "@/lib/time";
import { RideDetailClient } from "@/components/rides/ride-detail-client";

export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireUser();

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

  const acceptedOffer = ride.matched_offer_id ? offers.find((o) => o.id === ride.matched_offer_id && o.status === "accepted") : undefined;
  const isMatchedDriver = !!acceptedOffer && acceptedOffer.driver_id === user.id;

  const [contact, shareToken, riderBlocked] = await Promise.all([
    isRider || isMatchedDriver ? getRideContacts(id) : Promise.resolve(null),
    isRider ? getTripShareToken(id) : Promise.resolve(null),
    isRider ? Promise.resolve(false) : isBlocked(ride.rider_id),
  ]);

  // Rider-only extras: emergency contact for trip sharing, and how many
  // upcoming rides are in the same weekly series
  let emergencyContact: { name: string | null; phone: string | null } | null = null;
  let seriesUpcoming = 0;
  if (isRider) {
    const admin = createAdminClient();
    const [{ data: me }, { count }] = await Promise.all([
      admin.from("users").select("emergency_contact_name, emergency_contact_phone").eq("id", user.id).single(),
      ride.series_id
        ? admin
            .from("ride_requests")
            .select("id", { count: "exact", head: true })
            .eq("series_id", ride.series_id)
            .in("status", ["open", "matched"])
            .gte("ride_date", todayInAppZone())
        : Promise.resolve({ count: 0 }),
    ]);
    emergencyContact = me ? { name: me.emergency_contact_name, phone: me.emergency_contact_phone } : null;
    seriesUpcoming = count || 0;
  }

  return (
    <RideDetailClient
      ride={ride}
      offers={offers}
      isRider={isRider}
      isMatchedDriver={isMatchedDriver}
      currentUserId={user.id}
      existingOffer={existingOffer || null}
      existingReview={existingReview}
      driverRatings={driverRatings}
      acceptedDriverId={acceptedOffer?.driver_id || null}
      acceptedDriverName={acceptedOffer?.driver?.full_name || null}
      contact={contact}
      shareToken={shareToken}
      emergencyContact={emergencyContact}
      seriesUpcoming={seriesUpcoming}
      riderBlocked={riderBlocked}
    />
  );
}
