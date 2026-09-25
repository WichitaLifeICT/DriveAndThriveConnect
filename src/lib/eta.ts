/**
 * Rough driving estimate from two points, without a maps service:
 * straight-line distance x a road factor, at a typical Wichita city speed.
 * Good enough for "about 15 minutes"; not turn-by-turn accurate.
 */
const EARTH_RADIUS_MILES = 3958.8;
const ROAD_FACTOR = 1.3; // roads are longer than a straight line
const AVERAGE_MPH = 28;
const OVERHEAD_MINUTES = 3; // parking, pulling out, lights

export interface Point {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

function isRealPoint(p: Point): p is { lat: number; lng: number } {
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    !(p.lat === 0 && p.lng === 0)
  );
}

export function straightLineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export interface TripEstimate {
  miles: number;
  minutes: number;
}

/** Null when either end has no usable coordinates. */
export function estimateTrip(from: Point, to: Point): TripEstimate | null {
  if (!isRealPoint(from) || !isRealPoint(to)) return null;
  const miles = straightLineMiles(from, to) * ROAD_FACTOR;
  const minutes = Math.max(5, Math.round((miles / AVERAGE_MPH) * 60 + OVERHEAD_MINUTES));
  return { miles: Math.round(miles * 10) / 10, minutes };
}

/** "About 15 min · 6.2 mi" */
export function formatTripEstimate(e: TripEstimate | null): string | null {
  if (!e) return null;
  const time = e.minutes >= 60 ? `${Math.floor(e.minutes / 60)} hr ${e.minutes % 60} min` : `${e.minutes} min`;
  return `About ${time} · ${e.miles < 1 ? "<1" : e.miles} mi`;
}

/** Estimate for a ride row (pickup -> drop-off). */
export function rideEstimateLabel(ride: {
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
}): string | null {
  return formatTripEstimate(
    estimateTrip({ lat: ride.pickup_lat, lng: ride.pickup_lng }, { lat: ride.dropoff_lat, lng: ride.dropoff_lng })
  );
}
