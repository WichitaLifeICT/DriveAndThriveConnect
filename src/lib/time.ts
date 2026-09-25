/** Ride dates and times are local Wichita time. */
export const APP_TIME_ZONE = "America/Chicago";

/** Today's date (YYYY-MM-DD) in Wichita. */
export function todayInAppZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Add days to a YYYY-MM-DD date string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Format "HH:MM[:SS]" as "9:05 AM". */
export function formatClockTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

/** Format a YYYY-MM-DD date as "Monday, October 5". */
export function formatLongDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Offset of the app time zone at a given instant, e.g. "-05:00". */
function zoneOffset(at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return match ? `${match[1]}:${match[2] || "00"}` : "+00:00";
}

/** The instant a ride starts, from its local (Wichita) date and time. */
export function rideStartsAt(date: string, time: string): Date {
  const local = `${date}T${time.slice(0, 5)}:00`;
  // Use the offset in effect around that local time (handles DST)
  const guess = new Date(`${local}Z`);
  return new Date(`${local}${zoneOffset(guess)}`);
}
