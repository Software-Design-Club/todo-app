import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimitWindows } from "@/lib/rate-limit";

describe("rate limit", () => {
  beforeEach(() => {
    resetRateLimitWindows();
    vi.useRealTimers();
  });

  it("allows requests within the configured window limit", () => {
    const first = checkRateLimit({ key: "invite:1", limit: 2, windowMs: 60_000 });
    const second = checkRateLimit({ key: "invite:1", limit: 2, windowMs: 60_000 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
  });

  it("blocks requests that exceed the configured limit", () => {
    checkRateLimit({ key: "invite:2", limit: 1, windowMs: 60_000 });
    const blocked = checkRateLimit({
      key: "invite:2",
      limit: 1,
      windowMs: 60_000,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets allowance after the window expires", () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-09T10:00:00.000Z");
    vi.setSystemTime(now);

    checkRateLimit({ key: "invite:3", limit: 1, windowMs: 1_000 });
    const blocked = checkRateLimit({ key: "invite:3", limit: 1, windowMs: 1_000 });
    expect(blocked.allowed).toBe(false);

    vi.setSystemTime(new Date(now.getTime() + 1_001));
    const allowedAgain = checkRateLimit({
      key: "invite:3",
      limit: 1,
      windowMs: 1_000,
    });
    expect(allowedAgain.allowed).toBe(true);
  });
});
