import { describe, expect, it } from "vitest";
import { estimateTrip, formatTripEstimate, rideEstimateLabel } from "@/lib/eta";

// Wesley Medical Center -> Wichita State University (about 3 mi by road)
const wesley = { lat: 37.6956, lng: -97.3098 };
const wsu = { lat: 37.7197, lng: -97.2939 };

describe("estimateTrip", () => {
  it("gives a sensible in-town estimate", () => {
    const e = estimateTrip(wesley, wsu)!;
    expect(e.miles).toBeGreaterThan(2);
    expect(e.miles).toBeLessThan(5);
    expect(e.minutes).toBeGreaterThanOrEqual(5);
    expect(e.minutes).toBeLessThan(20);
  });

  it("returns null without real coordinates (typed-in addresses stored 0,0)", () => {
    expect(estimateTrip({ lat: 0, lng: 0 }, wsu)).toBeNull();
    expect(estimateTrip({ lat: null, lng: null }, wsu)).toBeNull();
  });
});

describe("formatTripEstimate", () => {
  it("formats minutes, hours and short trips", () => {
    expect(formatTripEstimate({ minutes: 14, miles: 6.2 })).toBe("About 14 min · 6.2 mi");
    expect(formatTripEstimate({ minutes: 75, miles: 40 })).toBe("About 1 hr 15 min · 40 mi");
    expect(formatTripEstimate({ minutes: 5, miles: 0.4 })).toBe("About 5 min · <1 mi");
    expect(formatTripEstimate(null)).toBeNull();
  });

  it("works from a ride row", () => {
    expect(
      rideEstimateLabel({ pickup_lat: wesley.lat, pickup_lng: wesley.lng, dropoff_lat: wsu.lat, dropoff_lng: wsu.lng })
    ).toMatch(/^About \d+ min · [\d.]+ mi$/);
  });
});
