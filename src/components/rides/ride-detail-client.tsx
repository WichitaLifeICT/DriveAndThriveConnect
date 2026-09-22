"use client";

import { useState } from "react";
import { createOffer, acceptOffer, declineOffer } from "@/actions/offers";
import { updateRideStatus } from "@/actions/rides";
import { submitReview } from "@/actions/reviews";
import { getOrCreateThread } from "@/actions/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RIDE_STATUSES, VISIBILITY_TIERS, OFFER_STATUSES } from "@/lib/constants";
import { formatRideDate, formatRideTime, formatRelativeTime } from "@/lib/utils/format";
import type { RideRequest, RideOffer, DriverReview } from "@/types/database";
import { useRouter } from "next/navigation";

/* ─── Star Rating Component ─── */
function StarRating({
  rating,
  onRate,
  size = "lg",
}: {
  rating: number;
  onRate?: (value: number) => void;
  size?: "sm" | "lg";
}) {
  const [hovered, setHovered] = useState(0);
  const stars = [1, 2, 3, 4, 5];
  const sizeClass = size === "lg" ? "w-8 h-8" : "w-4 h-4";

  return (
    <div className="flex gap-1">
      {stars.map((star) => {
        const filled = star <= (hovered || rating);
        return (
          <button
            key={star}
            type="button"
            onClick={() => onRate?.(star)}
            onMouseEnter={() => onRate && setHovered(star)}
            onMouseLeave={() => onRate && setHovered(0)}
            className={`${sizeClass} ${onRate ? "cursor-pointer" : "cursor-default"} transition-colors`}
            disabled={!onRate}
          >
            <svg
              viewBox="0 0 24 24"
              fill={filled ? "#f59e0b" : "none"}
              stroke={filled ? "#f59e0b" : "#d1d5db"}
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Inline Star Display ─── */
function DriverRatingBadge({
  average,
  count,
}: {
  average: number;
  count: number;
}) {
  if (count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <svg className="w-3.5 h-3.5 fill-amber-400" viewBox="0 0 24 24">
        <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
      <span className="font-medium">{average}</span>
      <span className="text-gray-400">({count})</span>
    </span>
  );
}

/* ─── Main Component ─── */
interface RideDetailClientProps {
  ride: RideRequest & { rider: { id: string; full_name: string | null; avatar_url: string | null } | null };
  offers: (RideOffer & { driver: { id: string; full_name: string | null; avatar_url: string | null } | null })[];
  isRider: boolean;
  currentUserId: string;
  existingOffer: RideOffer | null;
  existingReview: DriverReview | null;
  driverRatings: Record<string, { average: number; count: number }>;
  acceptedDriverId: string | null;
}

export function RideDetailClient({
  ride,
  offers,
  isRider,
  currentUserId,
  existingOffer,
  existingReview,
  driverRatings,
  acceptedDriverId,
}: RideDetailClientProps) {
  const router = useRouter();
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(!!existingReview);

  const statusConfig = RIDE_STATUSES[ride.status as keyof typeof RIDE_STATUSES];
  const visConfig = VISIBILITY_TIERS.find((v) => v.value === ride.visibility);

  async function handleCreateOffer(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.set("ride_request_id", ride.id);
    const result = await createOffer(formData);
    if (result?.error) {
      setError(result.error);
    } else {
      setShowOfferForm(false);
      router.refresh();
    }
    setLoading(false);
  }

  async function handleAcceptOffer(offerId: string) {
    setLoading(true);
    const result = await acceptOffer(offerId, ride.id);
    if (result?.error) setError(result.error);
    else router.refresh();
    setLoading(false);
  }

  async function handleDeclineOffer(offerId: string) {
    setLoading(true);
    const result = await declineOffer(offerId, ride.id);
    if (result?.error) setError(result.error);
    else router.refresh();
    setLoading(false);
  }

  async function handleCancel() {
    setLoading(true);
    await updateRideStatus(ride.id, "cancelled");
    router.refresh();
    setLoading(false);
  }

  async function handleComplete() {
    setLoading(true);
    await updateRideStatus(ride.id, "completed");
    router.refresh();
    setLoading(false);
  }

  async function handleMessage(driverId: string) {
    const result = await getOrCreateThread(ride.id, driverId);
    if (result?.threadId) {
      router.push(`/messages/${result.threadId}`);
    }
  }

  async function handleSubmitReview() {
    if (!acceptedDriverId || reviewRating === 0) return;
    setReviewLoading(true);
    setError(null);

    const result = await submitReview(
      ride.id,
      acceptedDriverId,
      reviewRating,
      reviewText || undefined
    );

    if (result?.error) {
      setError(result.error);
    } else {
      setReviewSubmitted(true);
      router.refresh();
    }
    setReviewLoading(false);
  }

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
        &larr; Back
      </button>

      {/* Ride Info */}
      <Card padding="lg">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {formatRideDate(ride.ride_date)} at {formatRideTime(ride.ride_time)}
            </h2>
            <p className="text-sm text-gray-500">
              Posted by {ride.rider?.full_name || "Unknown"}
            </p>
          </div>
          <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <span className="w-3 h-3 bg-green-500 rounded-full" />
              <div className="w-0.5 h-8 bg-gray-200" />
              <span className="w-3 h-3 bg-red-500 rounded-full" />
            </div>
            <div className="space-y-4 flex-1">
              <div>
                <p className="text-xs text-gray-400">Pickup</p>
                <p className="text-sm text-gray-900">{ride.pickup_address}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Drop-off</p>
                <p className="text-sm text-gray-900">{ride.dropoff_address}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {visConfig?.label}
            </span>
          </div>

          {ride.notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-700">{ride.notes}</p>
            </div>
          )}
        </div>

        {/* Rider actions */}
        {isRider && ride.status === "open" && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Button variant="danger" size="sm" onClick={handleCancel} loading={loading}>
              Cancel Request
            </Button>
          </div>
        )}
        {isRider && ride.status === "matched" && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Button size="sm" onClick={handleComplete} loading={loading}>
              Mark as Completed
            </Button>
          </div>
        )}
      </Card>

      {/* Rate Your Driver — shows after ride is completed for the rider */}
      {isRider && ride.status === "completed" && acceptedDriverId && (
        <Card padding="lg">
          {reviewSubmitted || existingReview ? (
            <div className="text-center py-2">
              <div className="flex justify-center mb-2">
                <StarRating rating={existingReview?.rating || reviewRating} size="lg" />
              </div>
              {(existingReview?.review_text || reviewText) && (
                <p className="text-sm text-gray-600 mt-2 italic">
                  &ldquo;{existingReview?.review_text || reviewText}&rdquo;
                </p>
              )}
              <p className="text-sm text-green-600 font-medium mt-2">
                Thank you for your review!
              </p>
            </div>
          ) : (
            <>
              <h3 className="font-medium text-gray-900 mb-1">Rate your driver</h3>
              <p className="text-xs text-gray-500 mb-4">
                How was your experience? Your rating helps the community.
              </p>

              <div className="flex justify-center mb-4">
                <StarRating rating={reviewRating} onRate={setReviewRating} size="lg" />
              </div>

              {reviewRating > 0 && (
                <p className="text-center text-sm text-gray-600 mb-4">
                  {reviewRating === 1 && "Poor"}
                  {reviewRating === 2 && "Fair"}
                  {reviewRating === 3 && "Good"}
                  {reviewRating === 4 && "Great"}
                  {reviewRating === 5 && "Excellent!"}
                </p>
              )}

              <Textarea
                id="review_text"
                name="review_text"
                label="Review (optional)"
                placeholder="Share your experience with this driver..."
                rows={2}
                value={reviewText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReviewText(e.target.value)}
              />

              <div className="mt-4">
                <Button
                  className="w-full"
                  onClick={handleSubmitReview}
                  loading={reviewLoading}
                  disabled={reviewRating === 0}
                >
                  Submit Review
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Offers */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Offers ({offers.length})
        </h3>

        {offers.length === 0 && (
          <Card>
            <p className="text-sm text-gray-500 text-center py-4">
              No offers yet.
            </p>
          </Card>
        )}

        <div className="space-y-3">
          {offers.map((offer) => {
            const offerStatus = OFFER_STATUSES[offer.status as keyof typeof OFFER_STATUSES];
            const driverRating = driverRatings[offer.driver_id];
            return (
              <Card key={offer.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 font-medium">
                      {(offer.driver?.full_name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {offer.driver?.full_name || "Unknown"}
                        </p>
                        {driverRating && (
                          <DriverRatingBadge
                            average={driverRating.average}
                            count={driverRating.count}
                          />
                        )}
                      </div>
                      {offer.suggested_price && (
                        <p className="text-xs text-gray-500">{offer.suggested_price}</p>
                      )}
                    </div>
                  </div>
                  <Badge className={offerStatus.color}>{offerStatus.label}</Badge>
                </div>

                {offer.message && (
                  <p className="mt-2 text-sm text-gray-600">{offer.message}</p>
                )}

                <p className="mt-1 text-xs text-gray-400">
                  {formatRelativeTime(offer.created_at)}
                </p>

                {isRider && offer.status === "pending" && ride.status === "open" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => handleAcceptOffer(offer.id)} loading={loading}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleDeclineOffer(offer.id)}
                      loading={loading}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMessage(offer.driver_id)}
                    >
                      Message
                    </Button>
                  </div>
                )}

                {!isRider && offer.driver_id === currentUserId && offer.status === "accepted" && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMessage(currentUserId)}
                    >
                      Message Rider
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Make Offer (for drivers) */}
      {!isRider && ride.status === "open" && !existingOffer && (
        <div>
          {!showOfferForm ? (
            <Button className="w-full" onClick={() => setShowOfferForm(true)}>
              Offer a Ride
            </Button>
          ) : (
            <Card padding="lg">
              <h3 className="font-medium text-gray-900 mb-4">Make an Offer</h3>
              <form action={handleCreateOffer} className="space-y-4">
                <Input
                  id="suggested_price"
                  name="suggested_price"
                  label="Suggested price (optional)"
                  placeholder='e.g. "Free", "$5", "Gas money"'
                />
                <Textarea
                  id="message"
                  name="message"
                  label="Message (optional)"
                  placeholder="Add a note for the rider..."
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button type="submit" loading={loading}>
                    Send Offer
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowOfferForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {existingOffer && existingOffer.status === "pending" && (
        <Card>
          <p className="text-sm text-gray-500 text-center">
            You&apos;ve already submitted an offer for this ride.
          </p>
        </Card>
      )}
    </div>
  );
}
