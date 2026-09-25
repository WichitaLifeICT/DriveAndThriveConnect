import { describe, expect, it } from "vitest";
import { normalizeUsPhone, toE164 } from "@/lib/phone";

describe("normalizeUsPhone", () => {
  it("formats 10-digit numbers in any common style", () => {
    expect(normalizeUsPhone("3165551234")).toBe("(316) 555-1234");
    expect(normalizeUsPhone("316-555-1234")).toBe("(316) 555-1234");
    expect(normalizeUsPhone("(316) 555 1234")).toBe("(316) 555-1234");
    expect(normalizeUsPhone("+1 316.555.1234")).toBe("(316) 555-1234");
  });

  it("treats empty input as no phone", () => {
    expect(normalizeUsPhone("")).toBeNull();
    expect(normalizeUsPhone("   ")).toBeNull();
    expect(normalizeUsPhone(null)).toBeNull();
  });

  it("rejects numbers that aren't valid US numbers", () => {
    expect(() => normalizeUsPhone("555-1234")).toThrow();
    expect(() => normalizeUsPhone("0165551234")).toThrow();
    expect(() => normalizeUsPhone("call me")).toThrow();
  });
});

describe("toE164", () => {
  it("converts formatted numbers for tel: links", () => {
    expect(toE164("(316) 555-1234")).toBe("+13165551234");
  });
});
