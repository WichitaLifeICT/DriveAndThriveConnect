import { getMyRideRequests, getDashboardStats, getPopularRoutes, getMyDrives } from "@/actions/rides";
import { getProfile } from "@/actions/profile";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RIDE_STATUSES, VISIBILITY_TIERS } from "@/lib/constants";
import { formatRideDate, formatRideTime } from "@/lib/utils/format";
import Link from "next/link";

export default async function DashboardPage() {
  const [rides, profile, stats, popularRoutes, drives] = await Promise.all([
    getMyRideRequests(),
    getProfile(),
    getDashboardStats(),
    getPopularRoutes(),
    getMyDrives(),
  ]);

  const activeRides = rides.filter(
    (r) => r.status === "open" || r.status === "matched"
  );
  const pastRides = rides.filter(
    (r) => r.status === "completed" || r.status === "cancelled" || r.status === "expired"
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {profile?.role === "driver"
            ? "Check available rides to offer"
            : "Post a ride request to get started"}
        </p>
      </div>

      {/* Personal Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total</div>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-gray-500 mt-0.5">Completed</div>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.matched}</div>
          <div className="text-xs text-gray-500 mt-0.5">Matched</div>
        </div>
        <div className="bg-white border border-teal-200 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-teal-600">{stats.completionRate}%</div>
          <div className="text-xs text-gray-500 mt-0.5">Rate</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/rides/new">
          <Card className="text-center hover:border-teal-300 transition-colors cursor-pointer">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Request Ride</p>
          </Card>
        </Link>
        <Link href="/rides">
          <Card className="text-center hover:border-teal-300 transition-colors cursor-pointer">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Browse Rides</p>
          </Card>
        </Link>
      </div>

      {/* Rides this user is driving */}
      {drives.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            You&apos;re Driving ({drives.length})
          </h3>
          <div className="space-y-2">
            {drives.map((d) => (
              <Link key={d.id} href={`/rides/${d.id}`}>
                <Card className="hover:border-teal-300 transition-colors cursor-pointer mb-2">
                  <p className="text-sm font-medium text-gray-900">
                    {formatRideDate(d.ride_date)} at {formatRideTime(d.ride_time)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(d.rider as unknown as { full_name: string | null } | null)?.full_name || "Rider"} ·{" "}
                    {d.pickup_address.split(",")[0]} → {d.dropoff_address.split(",")[0]}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Popular Routes */}
      {(popularRoutes.routes.length > 0 || popularRoutes.topPickups.length > 0) && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Popular Routes
          </h3>
          <Card padding="lg">
            {popularRoutes.routes.length > 0 && (
              <div className="space-y-2.5">
                {popularRoutes.routes.map((route, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-green-500 flex-shrink-0">●</span>
                      <span className="truncate text-gray-700">{route.pickup}</span>
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      <span className="text-red-500 flex-shrink-0">●</span>
                      <span className="truncate text-gray-700">{route.dropoff}</span>
                    </div>
                    <Badge className="bg-gray-100 text-gray-600 ml-2 flex-shrink-0">
                      {route.count}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {(popularRoutes.topPickups.length > 0 || popularRoutes.topDropoffs.length > 0) && (
              <div className={`grid grid-cols-2 gap-4 ${popularRoutes.routes.length > 0 ? "mt-4 pt-4 border-t border-gray-100" : ""}`}>
                {popularRoutes.topPickups.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Top Pickups</p>
                    <div className="flex flex-wrap gap-1.5">
                      {popularRoutes.topPickups.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs px-2 py-1 rounded-full">
                          {p.address}
                          <span className="text-green-500 font-medium">{p.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {popularRoutes.topDropoffs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Top Dropoffs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {popularRoutes.topDropoffs.map((d, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2 py-1 rounded-full">
                          {d.address}
                          <span className="text-red-500 font-medium">{d.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Active rides */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Active Rides
        </h3>
        {activeRides.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500 text-center py-4">
              No active rides. <Link href="/rides/new" className="text-teal-600 font-medium">Request one</Link>
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeRides.map((ride) => {
              const statusConfig = RIDE_STATUSES[ride.status as keyof typeof RIDE_STATUSES];
              const visConfig = VISIBILITY_TIERS.find((v) => v.value === ride.visibility);
              return (
                <Link key={ride.id} href={`/rides/${ride.id}`}>
                  <Card className="hover:border-teal-300 transition-colors cursor-pointer mb-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-medium text-gray-900">
                        {formatRideDate(ride.ride_date)} at {formatRideTime(ride.ride_time)}
                      </div>
                      <Badge className={statusConfig.color}>
                        {statusConfig.label}
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
                      <span className="text-xs text-gray-400">{visConfig?.label}</span>
                      {ride.is_round_trip && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Round trip</span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Past rides */}
      {pastRides.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Past Rides
          </h3>
          <div className="space-y-3">
            {pastRides.slice(0, 5).map((ride) => {
              const statusConfig = RIDE_STATUSES[ride.status as keyof typeof RIDE_STATUSES];
              return (
                <Link key={ride.id} href={`/rides/${ride.id}`}>
                  <Card className="opacity-75 hover:opacity-100 transition-opacity cursor-pointer mb-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        {formatRideDate(ride.ride_date)} — {ride.pickup_address.split(",")[0]} → {ride.dropoff_address.split(",")[0]}
                      </div>
                      <Badge className={statusConfig.color}>
                        {statusConfig.label}
                      </Badge>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
