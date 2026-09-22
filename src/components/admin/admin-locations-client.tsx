"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LOCATION_CATEGORIES } from "@/lib/wichita-locations";

interface TimeWindowStat {
  label: string;
  count: number;
}

interface LocationStat {
  name: string;
  address: string;
  category: string;
  fromCount: number;
  toCount: number;
  fromRiders: number;
  toRiders: number;
  totalRides: number;
  timeBreakdown: TimeWindowStat[];
}

interface NeighborhoodStat {
  name: string;
  zip: string;
  fromCount: number;
  toCount: number;
  fromRiders: number;
  toRiders: number;
  totalRides: number;
}

type SortOption = "name" | "total" | "category";
type TabOption = "presets" | "neighborhoods" | "times";

export function AdminLocationsClient({
  locations,
  neighborhoods,
  timeWindows,
}: {
  locations: LocationStat[];
  neighborhoods: NeighborhoodStat[];
  timeWindows: TimeWindowStat[];
}) {
  const [tab, setTab] = useState<TabOption>("presets");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("total");
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);

  const filtered = useMemo(() => {
    // Only show locations that have at least one ride
    let result = locations.filter((l) => l.totalRides > 0);

    if (activeCategory) {
      result = result.filter((l) => l.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.address.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortBy === "total") return b.totalRides - a.totalRides;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return catCmp;
      return b.totalRides - a.totalRides;
    });

    return result;
  }, [locations, search, activeCategory, sortBy]);

  const activeCount = locations.filter((l) => l.totalRides > 0).length;
  const maxTimeCount = timeWindows.length > 0 ? timeWindows[0].count : 1;

  function toggleExpand(locKey: string) {
    setExpandedLocation((prev) => (prev === locKey ? null : locKey));
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[
          { key: "presets" as TabOption, label: "Preset Locations" },
          { key: "neighborhoods" as TabOption, label: "Neighborhoods" },
          { key: "times" as TabOption, label: "Peak Times" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
              tab === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ==================== PRESET LOCATIONS TAB ==================== */}
      {tab === "presets" && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {locations.length}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Total Locations</div>
            </div>
            <div className="bg-white border border-green-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
              <div className="text-xs text-gray-500 mt-0.5">With Rides</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-gray-400">
                {locations.length - activeCount}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">No Rides Yet</div>
            </div>
          </div>

          {/* Search + Sort */}
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search locations..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="total">Most Used</option>
              <option value="name">Name (A-Z)</option>
              <option value="category">Category</option>
            </select>
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                !activeCategory
                  ? "bg-teal-100 text-teal-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {LOCATION_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? null : cat)
                }
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-teal-100 text-teal-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-500">
            Showing {filtered.length} location{filtered.length !== 1 ? "s" : ""}
          </p>

          {/* Location cards */}
          <div className="space-y-2">
            {filtered.map((loc) => {
              const locKey = `${loc.name}-${loc.address}`;
              const isExpanded = expandedLocation === locKey;
              const maxLocTime =
                loc.timeBreakdown.length > 0 ? loc.timeBreakdown[0].count : 1;

              return (
                <Card
                  key={locKey}
                  className={`cursor-pointer ${isExpanded ? "ring-2 ring-teal-300" : ""}`}
                  onClick={() => toggleExpand(locKey)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-gray-900">
                          {loc.name}
                        </h4>
                        <Badge className="bg-gray-100 text-gray-600 text-[10px]">
                          {loc.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{loc.address}</p>
                    </div>
                    {loc.totalRides > 0 && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-lg font-bold text-teal-600">
                            {loc.totalRides}
                          </div>
                          <div className="text-[10px] text-gray-400">rides</div>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {loc.totalRides > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-green-500 text-xs">● FROM</span>
                        <span className="text-sm text-gray-700 font-medium">
                          {loc.fromCount}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({loc.fromRiders} rider{loc.fromRiders !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-500 text-xs">● TO</span>
                        <span className="text-sm text-gray-700 font-medium">
                          {loc.toCount}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({loc.toRiders} rider{loc.toRiders !== 1 ? "s" : ""})
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Expanded time breakdown */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-600 mb-2">
                        Ride times for {loc.name}
                      </p>
                      {loc.timeBreakdown.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">
                          No time data available for this location.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {loc.timeBreakdown.map((tw) => (
                            <div
                              key={tw.label}
                              className="flex items-center gap-2"
                            >
                              <div className="w-20 text-xs font-medium text-gray-700 flex-shrink-0">
                                {tw.label}
                              </div>
                              <div className="flex-1">
                                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-teal-400 rounded-full transition-all"
                                    style={{
                                      width: `${Math.max(
                                        (tw.count / maxLocTime) * 100,
                                        6
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="text-xs font-bold text-gray-600 w-6 text-right flex-shrink-0">
                                {tw.count}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* ==================== NEIGHBORHOODS TAB ==================== */}
      {tab === "neighborhoods" && (
        <>
          {neighborhoods.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 text-center py-6">
                No custom address rides yet. Neighborhood data will appear when
                riders use custom addresses instead of presets.
              </p>
            </Card>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Rides from custom addresses (not preset locations), grouped by zip code neighborhood.
              </p>
              <div className="space-y-2">
                {neighborhoods.map((n) => (
                  <Card key={n.zip}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-gray-900">
                            {n.name}
                          </h4>
                          <Badge className="bg-blue-50 text-blue-600 text-[10px]">
                            {n.zip}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold text-teal-600">
                          {n.totalRides}
                        </div>
                        <div className="text-[10px] text-gray-400">rides</div>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-green-500 text-xs">● FROM</span>
                        <span className="text-sm text-gray-700 font-medium">
                          {n.fromCount}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({n.fromRiders} rider{n.fromRiders !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-500 text-xs">● TO</span>
                        <span className="text-sm text-gray-700 font-medium">
                          {n.toCount}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({n.toRiders} rider{n.toRiders !== 1 ? "s" : ""})
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ==================== PEAK TIMES TAB ==================== */}
      {tab === "times" && (
        <>
          {timeWindows.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 text-center py-6">
                No ride time data yet. Peak times will appear as rides are created.
              </p>
            </Card>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Most popular ride request times across all rides, sorted by demand.
              </p>
              <div className="space-y-1.5">
                {timeWindows.map((tw) => (
                  <div
                    key={tw.label}
                    className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3"
                  >
                    <div className="w-24 text-sm font-medium text-gray-900 flex-shrink-0">
                      {tw.label}
                    </div>
                    <div className="flex-1">
                      <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full transition-all"
                          style={{
                            width: `${Math.max(
                              (tw.count / maxTimeCount) * 100,
                              4
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-sm font-bold text-gray-700 w-8 text-right flex-shrink-0">
                      {tw.count}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
