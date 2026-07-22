import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health deployment evidence", () => {
  it("exposes the app version and effective transport policy without key values", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "configured-for-test");
    vi.stubEnv("EMBEDDING_API_KEY", "siliconflow-configured-for-test");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1");
    vi.stubEnv("KIMI_API_KEY", "legacy-moonshot-key");
    const response = GET();
    const body = await response.json();
    expect(body.appVersion).toBe("0.7.8");
    expect(body.transport).toEqual({ connectTimeoutMs: 1500, maxAttempts: 3 });
    expect(body.models).toMatchObject({
      deepseekConfigured: true,
      kimiConfigured: true,
      kimiProvider: "siliconflow",
      kimiModel: "moonshotai/Kimi-K2.5",
    });
    expect(JSON.stringify(body)).not.toContain("siliconflow-configured-for-test");
    expect(JSON.stringify(body)).not.toContain("legacy-moonshot-key");
  });
});
