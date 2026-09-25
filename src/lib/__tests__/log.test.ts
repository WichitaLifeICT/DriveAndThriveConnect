import { describe, expect, it, vi } from "vitest";
import { logError } from "@/lib/log";

describe("logError", () => {
  it("keeps the message and code of Supabase-style error objects", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("test", { message: "permission denied for table users", code: "42501" });
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.message).toBe("permission denied for table users");
    expect(logged.error.code).toBe("42501");
    spy.mockRestore();
  });
});
