import type { Metadata } from "next";
import { getSharedTrip } from "@/actions/rides";
import { Card } from "@/components/ui/card";
import { formatRideDate, formatRideTime } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trip status · Drive & Thrive Connect",
  robots: { index: false, follow: false },
};

const STATUS_TEXT: Record<string, string> = {
  open: "Looking for a driver",
  matched: "Driver confirmed",
  completed: "Ride complete",
  cancelled: "Ride cancelled",
  expired: "Request expired",
};

function time(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

export default async function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trip = await getSharedTrip(token);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-lg font-bold text-teal-700 text-center">Drive &amp; Thrive Connect</h1>

        {!trip ? (
          <Card padding="lg" className="text-center">
            <p className="text-gray-700">This trip link is no longer active.</p>
            <p className="text-sm text-gray-500 mt-1">The rider may have stopped sharing it.</p>
          </Card>
        ) : (
          <Card padding="lg">
            <p className="text-sm text-gray-500">
              {trip.riderFirstName || "Your contact"} shared their ride with you
            </p>
            <h2 className="text-xl font-semibold text-gray-900 mt-1">
              {STATUS_TEXT[trip.status] || trip.status}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {formatRideDate(trip.rideDate)} at {formatRideTime(trip.rideTime)}
            </p>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Pickup</p>
                <p className="text-gray-900">{trip.pickupAddress}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Drop-off</p>
                <p className="text-gray-900">{trip.dropoffAddress}</p>
              </div>
              {trip.driverFirstName && (
                <div>
                  <p className="text-xs text-gray-400">Driver</p>
                  <p className="text-gray-900">{trip.driverFirstName}</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-sm text-gray-700">
              <p>{trip.pickedUpAt ? `✓ Picked up ${time(trip.pickedUpAt)}` : "○ Not picked up yet"}</p>
              <p>{trip.droppedOffAt ? `✓ Dropped off ${time(trip.droppedOffAt)}` : "○ Not dropped off yet"}</p>
            </div>

            <p className="text-xs text-gray-400 mt-4">Last updated {time(trip.updatedAt)}. Refresh for the latest status.</p>
          </Card>
        )}

        <p className="text-xs text-gray-500 text-center">
          If you think someone is in danger, call 911.
        </p>
      </div>
    </div>
  );
}
