import "server-only";
import { logError } from "@/lib/log";

/**
 * Look up coordinates for a typed-in US address with the free U.S. Census
 * geocoder (no API key). Returns null if it can't be found or the lookup
 * is slow — trip estimates are optional, so this never blocks a ride.
 */
export async function geocodeUsAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const query = /wichita|,\s*ks\b|kansas/i.test(address) ? address : `${address}, Wichita, KS`;
  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" +
    encodeURIComponent(query);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] };
    };
    const c = body.result?.addressMatches?.[0]?.coordinates;
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) return null;
    return { lat: c.y, lng: c.x };
  } catch (err) {
    logError("geocode", err);
    return null;
  }
}
