import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimitForTests } from "./rate-limit";

function requestFor(ip: string) {
  return new Request("http://local.test/api/safety-check", {
    headers: { "x-forwarded-for": ip, "user-agent": "vitest" }
  });
}

// Guards the window-rollover boundary in checkRateLimit (existing.resetAt > current).
// An off-by-one here would either let max+1 requests through or wrongly block a
// legitimate one right at the window edge.
describe("rate-limit window boundary", () => {
  afterEach(() => {
    resetRateLimitForTests();
    vi.useRealTimers();
  });

  it("starts a fresh window exactly at resetAt (no off-by-one)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const options = { keyPrefix: "boundary", max: 2, windowMs: 60_000 };
    const ip = "203.0.113.9";

    const r1 = checkRateLimit(requestFor(ip), options);
    expect(r1.allowed).toBe(true);
    expect(r1.resetAt).toBe(60_000);

    // Just inside the window: the same bucket keeps counting.
    vi.setSystemTime(59_999);
    expect(checkRateLimit(requestFor(ip), options).allowed).toBe(true); // 2nd == max
    vi.setSystemTime(59_999);
    expect(checkRateLimit(requestFor(ip), options).allowed).toBe(false); // 3rd blocked

    // Exactly at resetAt: existing.resetAt > current is false, so a fresh window opens.
    vi.setSystemTime(60_000);
    const fresh = checkRateLimit(requestFor(ip), options);
    expect(fresh.allowed).toBe(true);
    expect(fresh.resetAt).toBe(120_000);
  });
});
