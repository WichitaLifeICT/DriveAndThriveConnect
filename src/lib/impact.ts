import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ImpactRide {
  id: string;
  riderId: string;
  rideDate: string;
  visibility: string;
  status: string;
  createdAt: string;
  firstOfferAt: string | null;
  matchedAt: string | null;
  completedAt: string | null;
  driverId: string | null;
  organizations: string[];
}

export interface ImpactSummary {
  label: string;
  requested: number;
  matched: number;
  completed: number;
  cancelled: number;
  expired: number;
  matchRate: number | null;
  completionRate: number | null;
  medianMinutesToFirstOffer: number | null;
  medianMinutesToMatch: number | null;
  uniqueRiders: number;
  uniqueDrivers: number;
}

function minutesBetween(from: string, to: string | null): number | null {
  if (!to) return null;
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarize(label: string, rides: ImpactRide[]): ImpactSummary {
  const requested = rides.length;
  const matched = rides.filter((r) => r.matchedAt).length;
  const completed = rides.filter((r) => r.status === "completed").length;
  const cancelled = rides.filter((r) => r.status === "cancelled").length;
  const expired = rides.filter((r) => r.status === "expired").length;
  // Rides the rider cancelled before anyone matched don't count against the match rate
  const cancelledUnmatched = rides.filter((r) => r.status === "cancelled" && !r.matchedAt).length;
  const matchable = requested - cancelledUnmatched;

  return {
    label,
    requested,
    matched,
    completed,
    cancelled,
    expired,
    matchRate: matchable > 0 ? Math.round((matched / matchable) * 100) : null,
    completionRate: matched > 0 ? Math.round((completed / matched) * 100) : null,
    medianMinutesToFirstOffer: median(
      rides.map((r) => minutesBetween(r.createdAt, r.firstOfferAt)).filter((m): m is number => m !== null)
    ),
    medianMinutesToMatch: median(
      rides.map((r) => minutesBetween(r.createdAt, r.matchedAt)).filter((m): m is number => m !== null)
    ),
    uniqueRiders: new Set(rides.map((r) => r.riderId)).size,
    uniqueDrivers: new Set(rides.map((r) => r.driverId).filter(Boolean)).size,
  };
}

/** Load rides requested for dates in [from, to] with timing and organizations. */
export async function loadImpactRides(from: string, to: string): Promise<ImpactRide[]> {
  const admin = createAdminClient();

  const { data: rides } = await admin
    .from("ride_requests")
    .select("id, rider_id, ride_date, visibility, status, created_at, matched_at, completed_at, matched_offer_id")
    .gte("ride_date", from)
    .lte("ride_date", to)
    .order("ride_date", { ascending: true })
    .limit(10000);
  if (!rides || rides.length === 0) return [];

  const rideIds = rides.map((r) => r.id);
  const riderIds = [...new Set(rides.map((r) => r.rider_id))];

  const [{ data: offers }, { data: memberships }] = await Promise.all([
    admin.from("ride_offers").select("id, ride_request_id, driver_id, status, created_at").in("ride_request_id", rideIds),
    admin
      .from("user_organizations")
      .select("user_id, organization:organizations(name)")
      .in("user_id", riderIds)
      .eq("status", "approved"),
  ]);

  const firstOffer = new Map<string, string>();
  const offerDriver = new Map<string, string>();
  for (const o of offers || []) {
    const prev = firstOffer.get(o.ride_request_id);
    if (!prev || o.created_at < prev) firstOffer.set(o.ride_request_id, o.created_at);
    offerDriver.set(o.id, o.driver_id);
  }
  const orgsByUser = new Map<string, string[]>();
  for (const m of memberships || []) {
    const name = (m.organization as unknown as { name: string } | null)?.name;
    if (!name) continue;
    orgsByUser.set(m.user_id, [...(orgsByUser.get(m.user_id) || []), name]);
  }

  return rides.map((r) => ({
    id: r.id,
    riderId: r.rider_id,
    rideDate: r.ride_date,
    visibility: r.visibility,
    status: r.status,
    createdAt: r.created_at,
    firstOfferAt: firstOffer.get(r.id) || null,
    matchedAt: r.matched_at,
    completedAt: r.completed_at,
    driverId: r.matched_offer_id ? offerDriver.get(r.matched_offer_id) || null : null,
    organizations: (orgsByUser.get(r.rider_id) || []).sort(),
  }));
}

/** Overall, per-organization and per-month summaries. */
export function buildImpactReport(rides: ImpactRide[]) {
  const byOrg = new Map<string, ImpactRide[]>();
  for (const ride of rides) {
    const orgs = ride.organizations.length > 0 ? ride.organizations : ["No organization"];
    for (const org of orgs) byOrg.set(org, [...(byOrg.get(org) || []), ride]);
  }
  const byMonth = new Map<string, ImpactRide[]>();
  for (const ride of rides) {
    const month = ride.rideDate.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) || []), ride]);
  }

  return {
    overall: summarize("All rides", rides),
    organizations: [...byOrg.entries()]
      .map(([org, list]) => summarize(org, list))
      .sort((a, b) => b.requested - a.requested),
    months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, list]) => summarize(m, list)),
  };
}

/** One row per ride, without names or addresses, for funders/partners. */
export function impactCsv(rides: ImpactRide[]): string {
  const header = [
    "ride_id",
    "ride_date",
    "organizations",
    "visibility",
    "status",
    "requested_at",
    "first_offer_at",
    "matched_at",
    "completed_at",
    "minutes_to_first_offer",
    "minutes_to_match",
  ];
  const escape = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = rides.map((r) =>
    [
      r.id,
      r.rideDate,
      r.organizations.join("; "),
      r.visibility,
      r.status,
      r.createdAt,
      r.firstOfferAt,
      r.matchedAt,
      r.completedAt,
      minutesBetween(r.createdAt, r.firstOfferAt),
      minutesBetween(r.createdAt, r.matchedAt),
    ]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}
