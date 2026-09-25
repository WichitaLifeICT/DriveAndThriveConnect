import { getEligibleRideRequests } from "@/actions/rides";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VISIBILITY_TIERS } from "@/lib/constants";
import { formatRideDate, formatRideTime } from "@/lib/utils/format";
import Link from "next/link";
import { rideEstimateLabel } from "@/lib/eta";

export default async function BrowseRidesPage() {
  const rides = await getEligibleRideRequests();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Available Rides</h2>
        <Link
          href="/rides/new"
          className="text-sm font-medium text-teal-600 hover:text-teal-500"
        >
          + Request Ride
        </Link>
      </div>

      {rides.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <p className="text-sm text-gray-500">
              No ride requests available right now.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Grow your network to see more rides.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rides.map((ride) => {
            const visConfig = VISIBILITY_TIERS.find(
              (v) => v.value === ride.visibility
            );
            const rider = ride.rider as { id: string; full_name: string | null; avatar_url: string | null } | null;

            return (
              <Link key={ride.id} href={`/rides/${ride.id}`}>
                <Card className="hover:border-teal-300 transition-colors cursor-pointer mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatRideDate(ride.ride_date)} at{" "}
                        {formatRideTime(ride.ride_time)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Posted by {rider?.full_name || "Unknown"}
                      </p>
                    </div>
                    <Badge className="bg-teal-100 text-teal-800">
                      {visConfig?.label}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">●</span>
                      <span className="line-clamp-1">{ride.pickup_address}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">●</span>
                      <span className="line-clamp-1">{ride.dropoff_address}</span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    {rideEstimateLabel(ride) && (
                      <span className="text-xs text-gray-500 shrink-0">{rideEstimateLabel(ride)}</span>
                    )}
                    {ride.is_round_trip && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        Round trip
                      </span>
                    )}
                    {ride.notes && (
                      <span className="text-xs text-gray-400 truncate">
                        {ride.notes}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
