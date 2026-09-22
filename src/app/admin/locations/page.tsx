import { getLocationStats } from "@/actions/admin";
import { AdminLocationsClient } from "@/components/admin/admin-locations-client";

export default async function AdminLocationsPage() {
  const { presetStats, neighborhoodStats, timeWindowStats } = await getLocationStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Locations</h2>
        <p className="text-sm text-gray-500 mt-1">
          Preset locations, neighborhood demand, and peak ride times
        </p>
      </div>

      <AdminLocationsClient
        locations={presetStats}
        neighborhoods={neighborhoodStats}
        timeWindows={timeWindowStats}
      />
    </div>
  );
}
