"use client";

import { useState } from "react";
import Link from "next/link";
import { createOffer, acceptOffer, declineOffer, withdrawOffer, backOutOfRide } from "@/actions/offers";
import { cancelRide, checkIn, reportNoShow, enableTripSharing, disableTripSharing } from "@/actions/rides";
import { submitReview } from "@/actions/reviews";
import { getOrCreateThread } from "@/actions/messages";
import { blockUser, unblockUser } from "@/actions/safety";
import { ReportDialog } from "@/components/safety/report-dialog";
import { toE164 } from "@/lib/phone";
import { rideEstimateLabel } from "@/lib/eta";
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
type RideWithRider = RideRequest & {
  rider: { id: string; full_name: string | null; avatar_url: string | null } | null;
  picked_up_at?: string | null;
  dropped_off_at?: string | null;
  series_id?: string | null;
  parent_ride_id?: string | null;
};

interface RideDetailClientProps {
  ride: RideWithRider;
  offers: (RideOffer & { driver: { id: string; full_name: string | null; avatar_url: string | null } | null })[];
  isRider: boolean;
  isMatchedDriver: boolean;
  currentUserId: string;
  existingOffer: RideOffer | null;
  existingReview: DriverReview | null;
  driverRatings: Record<string, { average: number; count: number }>;
  acceptedDriverId: string | null;
  acceptedDriverName: string | null;
  contact: { name: string | null; phone: string | null; role: string; relationship: string } | null;
  shareToken: string | null;
  emergencyContact: { name: string | null; phone: string | null } | null;
  seriesUpcoming: number;
  riderBlocked: boolean;
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function RideDetailClient({
  ride,
  offers,
  isRider,
  isMatchedDriver,
  currentUserId,
  existingOffer,
  existingReview,
  driverRatings,
  acceptedDriverId,
  acceptedDriverName,
  contact,
  shareToken: initialShareToken,
  emergencyContact,
  seriesUpcoming,
  riderBlocked,
}: RideDetailClientProps) {
  const router = useRouter();
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"cancel" | "backout" | "noshow" | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [shareToken, setShareToken] = useState(initialShareToken);
  const [copied, setCopied] = useState(false);

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(!!existingReview);

  const statusConfig =
    RIDE_STATUSES[ride.status as keyof typeof RIDE_STATUSES] || { label: ride.status, color: "bg-gray-100 text-gray-800" };
  const visConfig = VISIBILITY_TIERS.find((v) => v.value === ride.visibility);
  const isParticipant = isRider || isMatchedDriver;
  const isMatched = ride.status === "matched";
  const shareUrl = shareToken && typeof window !== "undefined" ? `${window.location.origin}/trip/${shareToken}` : null;

  async function run(key: string, action: () => Promise<{ error?: string } | undefined | void>, successNotice?: string) {
    setLoading(key);
    setError(null);
    setNotice(null);
    const result = await action();
    if (result && "error" in result && result.error) {
      setError(result.error);
    } else {
      if (successNotice) setNotice(successNotice);
      setConfirming(null);
      setReasonText("");
      router.refresh();
    }
    setLoading(null);
  }

  async function handleCreateOffer(formData: FormData) {
    formData.set("ride_request_id", ride.id);
    await run("offer", async () => {
      const result = await createOffer(formData);
      if (!result?.error) setShowOfferForm(false);
      return result;
    });
  }

  async function handleMessage(driverId: string) {
    setError(null);
    const result = await getOrCreateThread(ride.id, driverId);
    if (result?.threadId) {
      router.push(`/messages/${result.threadId}`);
    } else if (result?.error) {
      setError(result.error);
    }
  }

  async function handleShare() {
    let token = shareToken;
    if (!token) {
      setLoading("share");
      const result = await enableTripSharing(ride.id);
      setLoading(null);
      if (result.error || !result.token) {
        setError(result.error || "Couldn't create a share link.");
        return;
      }
      token = result.token;
      setShareToken(token);
    }
    const url = `${window.location.origin}/trip/${token}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Follow my ride", text: "Here's a live status link for my ride.", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Share sheet dismissed
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
            {rideEstimateLabel(ride) && (
              <p className="text-sm text-gray-600 mt-0.5">🕒 {rideEstimateLabel(ride)} (estimate)</p>
            )}
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
            {ride.is_round_trip && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                Round trip{ride.return_time ? ` · back at ${formatRideTime(ride.return_time)}` : ""}
              </span>
            )}
            {ride.series_id && (
              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">Weekly ride</span>
            )}
            {ride.parent_ride_id && (
              <Link href={`/rides/${ride.parent_ride_id}`} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                Return trip · view outbound ride
              </Link>
            )}
          </div>

          {ride.notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{ride.notes}</p>
            </div>
          )}

          {(ride.picked_up_at || ride.dropped_off_at) && (
            <div className="pt-2 border-t border-gray-100 text-sm text-gray-700 space-y-1">
              {ride.picked_up_at && <p>✓ Picked up at {formatTimestamp(ride.picked_up_at)}</p>}
              {ride.dropped_off_at && <p>✓ Dropped off at {formatTimestamp(ride.dropped_off_at)}</p>}
            </div>
          )}
        </div>

        {/* Rider actions on an open ride */}
        {isRider && ride.status === "open" && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
            <Link
              href={`/rides/${ride.id}/edit`}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Edit
            </Link>
            <Button variant="danger" size="sm" onClick={() => setConfirming("cancel")}>
              Cancel Request
            </Button>
          </div>
        )}

        {/* Check-ins for the rider and matched driver */}
        {isParticipant && isMatched && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <p className="text-xs text-gray-500">Check in so everyone knows where the ride is.</p>
            <div className="flex flex-wrap gap-2">
              {!ride.picked_up_at && (
                <Button size="sm" variant="secondary" loading={loading === "pickup"} onClick={() => run("pickup", () => checkIn(ride.id, "picked_up"))}>
                  Picked up
                </Button>
              )}
              <Button size="sm" loading={loading === "dropoff"} onClick={() => run("dropoff", () => checkIn(ride.id, "dropped_off"))}>
                Dropped off — ride complete
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              {isRider && (
                <>
                  <button className="text-sm text-gray-600 hover:text-gray-900" onClick={() => setConfirming("cancel")}>
                    Cancel ride
                  </button>
                  {!ride.picked_up_at && (
                    <button className="text-sm text-gray-600 hover:text-gray-900" onClick={() => setConfirming("noshow")}>
                      Driver didn&apos;t show up
                    </button>
                  )}
                </>
              )}
              {isMatchedDriver && !ride.picked_up_at && (
                <button className="text-sm text-gray-600 hover:text-gray-900" onClick={() => setConfirming("backout")}>
                  I can&apos;t make it
                </button>
              )}
            </div>
          </div>
        )}

        {/* Confirmations */}
        {confirming && (
          <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
            {confirming === "cancel" && (
              <>
                <p className="text-sm text-gray-800">
                  Cancel this ride?{isMatched ? " Your driver will be notified right away." : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="danger" loading={loading === "cancel"} onClick={() => run("cancel", () => cancelRide(ride.id), "Ride cancelled.")}>
                    Cancel this ride
                  </Button>
                  {seriesUpcoming > 1 && (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={loading === "cancel-series"}
                      onClick={() => run("cancel-series", () => cancelRide(ride.id, { wholeSeries: true }), "Weekly rides cancelled.")}
                    >
                      Cancel all {seriesUpcoming} upcoming weekly rides
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Keep ride
                  </Button>
                </div>
              </>
            )}
            {confirming === "backout" && (
              <>
                <p className="text-sm text-gray-800">
                  Back out of this ride? The rider will be told immediately and the request reopened for other drivers.
                </p>
                <Textarea
                  id="backout_reason"
                  label="Reason (optional, shared with the rider)"
                  rows={2}
                  maxLength={500}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" loading={loading === "backout"} onClick={() => run("backout", () => backOutOfRide(ride.id, reasonText))}>
                    Back out
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Never mind
                  </Button>
                </div>
              </>
            )}
            {confirming === "noshow" && (
              <>
                <p className="text-sm text-gray-800">
                  Report that {acceptedDriverName || "your driver"} didn&apos;t show up? Admins will be notified, and if
                  there&apos;s still time your request will reopen for other drivers.
                </p>
                <Textarea
                  id="noshow_details"
                  label="Details (optional)"
                  rows={2}
                  maxLength={1000}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={loading === "noshow"}
                    onClick={() => run("noshow", () => reportNoShow(ride.id, reasonText), "Thanks for letting us know.")}
                  >
                    Report no-show
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Never mind
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {notice}
        </div>
      )}

      {/* Contact + safety for a matched ride */}
      {isParticipant && isMatched && (
        <Card padding="lg">
          <h3 className="font-medium text-gray-900">
            {contact?.role === "driver" ? "Your driver" : "Your rider"}: {contact?.name || "Unknown"}
          </h3>
          {contact?.relationship && <p className="text-sm text-teal-700 mb-3">{contact.relationship}</p>}
          <div className="flex flex-wrap gap-2">
            {contact?.phone ? (
              <>
                <a
                  href={`tel:${toE164(contact.phone)}`}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                >
                  Call {contact.phone}
                </a>
                <a
                  href={`sms:${toE164(contact.phone)}`}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Text
                </a>
              </>
            ) : (
              <p className="text-sm text-gray-500">No phone number shared — use in-app messages.</p>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleMessage(isRider ? acceptedDriverId! : currentUserId)}
            >
              Message
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <h4 className="text-sm font-medium text-gray-900">Safety</h4>
            {isRider && (
              <div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button size="sm" variant="secondary" loading={loading === "share"} onClick={handleShare}>
                    {copied ? "Link copied!" : "Share trip status"}
                  </Button>
                  {emergencyContact?.phone && shareUrl && (
                    <a
                      href={`sms:${toE164(emergencyContact.phone)}?&body=${encodeURIComponent(`I'm taking a ride. Follow along here: ${shareUrl}`)}`}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Text {emergencyContact.name || "my emergency contact"}
                    </a>
                  )}
                  {shareToken && (
                    <button
                      className="text-xs text-gray-500 hover:text-gray-700"
                      onClick={async () => {
                        await disableTripSharing(ride.id);
                        setShareToken(null);
                      }}
                    >
                      Stop sharing
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Anyone with the link can see this ride&apos;s status until you stop sharing.
                  {!emergencyContact?.phone && (
                    <>
                      {" "}
                      <Link href="/profile" className="text-teal-600">Add an emergency contact</Link> to text it in one tap.
                    </>
                  )}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <a href="tel:911" className="inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700">
                Emergency? Call 911
              </a>
              <ReportDialog
                reportedUserId={isRider ? acceptedDriverId : ride.rider_id}
                reportedUserName={contact?.name}
                rideRequestId={ride.id}
                defaultCategory="safety_incident"
                triggerLabel="Report a safety concern"
              />
            </div>
          </div>
        </Card>
      )}

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
              <div className="mt-3 text-center">
                <ReportDialog
                  reportedUserId={acceptedDriverId}
                  reportedUserName={acceptedDriverName}
                  rideRequestId={ride.id}
                  triggerLabel="Something went wrong on this ride? Report it"
                  triggerClassName="text-xs text-gray-500 hover:text-gray-700"
                />
              </div>
            </>
          )}
        </Card>
      )}

      {/* Offers */}
      {(isRider || offers.length > 0) && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Offers ({offers.length})
          </h3>

          {offers.length === 0 && (
            <Card>
              <p className="text-sm text-gray-500 text-center py-4">
                No offers yet. We&apos;ll notify you when a driver offers.
              </p>
            </Card>
          )}

          <div className="space-y-3">
            {offers.map((offer) => {
              const offerStatus =
                OFFER_STATUSES[offer.status as keyof typeof OFFER_STATUSES] || { label: offer.status, color: "bg-gray-100 text-gray-800" };
              const driverRating = driverRatings[offer.driver_id];
              const isMine = offer.driver_id === currentUserId;
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
                            {isMine ? "Your offer" : offer.driver?.full_name || "Unknown"}
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
                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      <Button size="sm" onClick={() => run(`accept-${offer.id}`, () => acceptOffer(offer.id, ride.id))} loading={loading === `accept-${offer.id}`}>
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => run(`decline-${offer.id}`, () => declineOffer(offer.id, ride.id))}
                        loading={loading === `decline-${offer.id}`}
                      >
                        Decline
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleMessage(offer.driver_id)}>
                        Message
                      </Button>
                      <ReportDialog
                        reportedUserId={offer.driver_id}
                        reportedUserName={offer.driver?.full_name}
                        rideRequestId={ride.id}
                        triggerLabel="Report"
                        triggerClassName="text-xs text-gray-400 hover:text-red-600 ml-auto"
                      />
                    </div>
                  )}

                  {isMine && offer.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleMessage(currentUserId)}>
                        Message Rider
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={loading === "withdraw"}
                        onClick={() => run("withdraw", () => withdrawOffer(offer.id, ride.id))}
                      >
                        Withdraw offer
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Make Offer (for drivers) */}
      {!isRider && ride.status === "open" && !existingOffer && !riderBlocked && (
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
                  maxLength={100}
                />
                <Textarea
                  id="message"
                  name="message"
                  label="Message (optional)"
                  placeholder="Add a note for the rider..."
                  rows={2}
                  maxLength={1000}
                />
                <div className="flex gap-2">
                  <Button type="submit" loading={loading === "offer"}>
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

      {/* Drivers viewing someone else's request */}
      {!isRider && !isMatchedDriver && (
        <div className="flex justify-center gap-6 pt-2">
          <ReportDialog
            reportedUserId={ride.rider_id}
            reportedUserName={ride.rider?.full_name}
            rideRequestId={ride.id}
            triggerLabel="Report this request"
            triggerClassName="text-xs text-gray-400 hover:text-red-600"
          />
          <button
            className="text-xs text-gray-400 hover:text-red-600"
            onClick={() =>
              run(
                "block",
                () => (riderBlocked ? unblockUser(ride.rider_id) : blockUser(ride.rider_id)),
                riderBlocked ? "Unblocked." : "Blocked. You won't see each other's rides or messages."
              )
            }
          >
            {riderBlocked ? "Unblock" : "Block"} {ride.rider?.full_name?.split(" ")[0] || "rider"}
          </button>
        </div>
      )}
    </div>
  );
}
