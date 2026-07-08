import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, rateLimitHeaders, resetRateLimitForTests } from "./rate-limit";

function requestFor(ip: string) {
  return new Request("http://local.test/api/safety-check", {
    headers: {
      "x-forwarded-for": ip,
      "user-agent": "vitest"
    }
  });
}

describe("rate-limit", () => {
  afterEach(() => {
    resetRateLimitForTests();
    vi.unstubAllEnvs();
  });

  it("uses a hashed client key and returns standard rate-limit headers", () => {
    vi.stubEnv("QUIET_ROOM_RATE_LIMIT_SALT", "test-rate-salt");
    const options = { keyPrefix: "test", max: 2, windowMs: 60_000 };

    const first = checkRateLimit(requestFor("203.0.113.1"), options);
    const second = checkRateLimit(requestFor("203.0.113.1"), options);
    const third = checkRateLimit(requestFor("203.0.113.1"), options);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.keyHash).toMatch(/^rl_[a-f0-9]{24}$/);
    expect(third.keyHash).not.toContain("203.0.113.1");
    expect(rateLimitHeaders(third)).toEqual(
      expect.objectContaining({
        "X-RateLimit-Limit": "2",
        "X-RateLimit-Remaining": "0",
        "Retry-After": expect.any(String)
      })
    );
  });

  it("bypasses limits during compiled safety eval mode", () => {
    vi.stubEnv("SAFETY_EVAL_MODE", "compiled");
    const options = { keyPrefix: "test", max: 1, windowMs: 60_000 };

    expect(checkRateLimit(requestFor("203.0.113.2"), options).allowed).toBe(true);
    expect(checkRateLimit(requestFor("203.0.113.2"), options).allowed).toBe(true);
  });
});
