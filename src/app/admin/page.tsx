import { getAdminStats, getAdminRouteStats } from "@/actions/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminDashboard() {
  const [stats, routeStats] = await Promise.all([
    getAdminStats(),
    getAdminRouteStats(),
  ]);

  const statCards = [
    { label: "Total Users", value: stats.totalUsers, color: "text-blue-600", borderColor: "border-blue-200" },
    { label: "Total Rides", value: stats.totalRides, color: "text-green-600", borderColor: "border-green-200" },
    { label: "Completed", value: stats.completedRides, color: "text-emerald-600", borderColor: "border-emerald-200" },
    { label: "Active Rides", value: stats.activeRides, color: "text-teal-600", borderColor: "border-teal-200" },
    { label: "Pending Apps", value: stats.pendingApplications, color: "text-yellow-600", borderColor: "border-yellow-200" },
    { label: "Vetted Drivers", value: stats.vettedDrivers, color: "text-purple-600", borderColor: "border-purple-200" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
        {statCards.map((stat) => (
          <div key={stat.label} className={`bg-white border ${stat.borderColor} rounded-xl p-4`}>
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color} mt-1`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Popular Routes */}
      {routeStats.routes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Popular Routes
          </h3>
          <Card padding="lg">
            <div className="space-y-2.5">
              {routeStats.routes.map((route, i) => (
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
          </Card>
        </div>
      )}

      {/* Top Locations */}
      {(routeStats.topPickups.length > 0 || routeStats.topDropoffs.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {routeStats.topPickups.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                Top Pickup Locations
              </h3>
              <Card padding="lg">
                <div className="space-y-2">
                  {routeStats.topPickups.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-green-500">●</span>
                        <span className="text-gray-700">{p.address}</span>
                      </div>
                      <Badge className="bg-green-50 text-green-700">{p.count}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          {routeStats.topDropoffs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                Top Dropoff Locations
              </h3>
              <Card padding="lg">
                <div className="space-y-2">
                  {routeStats.topDropoffs.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-red-500">●</span>
                        <span className="text-gray-700">{d.address}</span>
                      </div>
                      <Badge className="bg-red-50 text-red-700">{d.count}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
