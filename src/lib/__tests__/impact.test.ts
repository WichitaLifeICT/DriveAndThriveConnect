import { describe, expect, it } from "vitest";
import { buildImpactReport, impactCsv, summarize, type ImpactRide } from "@/lib/impact";

function ride(overrides: Partial<ImpactRide>): ImpactRide {
  return {
    id: "r",
    riderId: "rider-1",
    rideDate: "2026-09-01",
    visibility: "circle",
    status: "open",
    createdAt: "2026-08-30T10:00:00Z",
    firstOfferAt: null,
    matchedAt: null,
    completedAt: null,
    driverId: null,
    organizations: [],
    ...overrides,
  };
}

describe("summarize", () => {
  it("computes match rate excluding rides cancelled before a match", () => {
    const s = summarize("x", [
      ride({ id: "1", status: "completed", matchedAt: "2026-08-30T11:00:00Z", firstOfferAt: "2026-08-30T10:30:00Z", driverId: "d1" }),
      ride({ id: "2", status: "expired" }),
      ride({ id: "3", status: "cancelled" }),
      ride({ id: "4", status: "matched", matchedAt: "2026-08-30T13:00:00Z", firstOfferAt: "2026-08-30T12:00:00Z", driverId: "d2" }),
    ]);
    expect(s.requested).toBe(4);
    expect(s.matched).toBe(2);
    expect(s.completed).toBe(1);
    // 2 matched out of 3 matchable (ride 3 was cancelled before anyone matched)
    expect(s.matchRate).toBe(67);
    expect(s.completionRate).toBe(50);
    // First offers after 30 and 120 minutes -> median 75
    expect(s.medianMinutesToFirstOffer).toBe(75);
    expect(s.uniqueDrivers).toBe(2);
  });

  it("returns nulls when there's nothing to measure", () => {
    const s = summarize("empty", []);
    expect(s.matchRate).toBeNull();
    expect(s.medianMinutesToMatch).toBeNull();
  });
});

describe("buildImpactReport", () => {
  it("groups by each of a rider's organizations and by month", () => {
    const report = buildImpactReport([
      ride({ id: "1", organizations: ["Hope CDC", "Family Promise"] }),
      ride({ id: "2", rideDate: "2026-10-02" }),
    ]);
    expect(report.organizations.map((o) => o.label).sort()).toEqual(["Family Promise", "Hope CDC", "No organization"]);
    expect(report.months.map((m) => m.label)).toEqual(["2026-09", "2026-10"]);
  });
});

describe("impactCsv", () => {
  it("quotes values with commas and has no names or addresses", () => {
    const csv = impactCsv([ride({ id: "1", organizations: ["Build & Rebuild", "A, B"] })]);
    const [header, row] = csv.split("\n");
    expect(header).not.toMatch(/name|address/);
    expect(row).toContain('"Build & Rebuild; A, B"');
  });
});
