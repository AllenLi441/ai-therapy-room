import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health deployment evidence", () => {
  it("exposes the app version and effective transport policy without key values", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "configured-for-test");
    vi.stubEnv("KIMI_API_KEY", "configured-for-test");
    const response = GET();
    const body = await response.json();
    expect(body.appVersion).toBe("0.7.8");
    expect(body.transport).toEqual({ connectTimeoutMs: 1500, maxAttempts: 3 });
    expect(JSON.stringify(body)).not.toContain("configured-for-test");
  });
});
