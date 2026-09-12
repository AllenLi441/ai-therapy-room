import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
afterEach(() => { vi.useRealTimers(); });

describe("conversation provider observations", () => {
  it("reports unknown before a call, failure on fallback, then recovery on success", async () => {
    const { getChatLlmHealth, recordChatLlmFallback } = await import("./chat-monitoring");
    expect(getChatLlmHealth()).toMatchObject({ healthy: null, status: "unknown", observations: 0, scope: "instance" });
    recordChatLlmFallback(true);
    recordChatLlmFallback(true);
    expect(getChatLlmHealth()).toMatchObject({ healthy: false, status: "degraded", consecutiveFailures: 2, recentFailures: 2 });
    recordChatLlmFallback(false);
    expect(getChatLlmHealth()).toMatchObject({ healthy: true, status: "healthy", consecutiveFailures: 0, recentFailures: 2 });
  });

  it("expires stale observations at five minutes rather than claiming permanent health", async () => {
    const { getChatLlmHealth, recordChatLlmFallback } = await import("./chat-monitoring");
    recordChatLlmFallback(false);
    vi.advanceTimersByTime(5 * 60_000);
    expect(getChatLlmHealth()).toMatchObject({ healthy: null, status: "unknown", observations: 0 });
  });

  it("keeps a bounded aggregate and exposes no content or identifiers", async () => {
    const { getChatLlmHealth, recordChatLlmFallback } = await import("./chat-monitoring");
    for (let i = 0; i < 600; i++) recordChatLlmFallback(true);
    const health = getChatLlmHealth();
    expect(health.observations).toBe(500);
    expect(Object.keys(health).sort()).toEqual(["consecutiveFailures", "healthy", "observations", "recentFailures", "scope", "status"]);
  });
});
