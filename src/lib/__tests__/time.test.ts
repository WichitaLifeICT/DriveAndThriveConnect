import { describe, expect, it } from "vitest";
import { addDays, formatClockTime, rideStartsAt, todayInAppZone } from "@/lib/time";

describe("todayInAppZone", () => {
  it("uses Wichita's date, not UTC's", () => {
    // 03:00 UTC on Jan 2 is still Jan 1 in Wichita (UTC-6)
    expect(todayInAppZone(new Date("2026-01-02T03:00:00Z"))).toBe("2026-01-01");
    expect(todayInAppZone(new Date("2026-01-02T12:00:00Z"))).toBe("2026-01-02");
  });
});

describe("rideStartsAt", () => {
  it("handles standard time (UTC-6)", () => {
    expect(rideStartsAt("2026-12-01", "09:30:00").toISOString()).toBe("2026-12-01T15:30:00.000Z");
  });

  it("handles daylight saving time (UTC-5)", () => {
    expect(rideStartsAt("2026-07-01", "09:30").toISOString()).toBe("2026-07-01T14:30:00.000Z");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-29", 7)).toBe("2027-01-05");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("formatClockTime", () => {
  it("formats 24-hour times", () => {
    expect(formatClockTime("00:05:00")).toBe("12:05 AM");
    expect(formatClockTime("12:00")).toBe("12:00 PM");
    expect(formatClockTime("17:45")).toBe("5:45 PM");
  });
});
