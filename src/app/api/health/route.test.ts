import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { APP_VERSION } from "@/lib/version";
import * as monitoring from "@/lib/chat-monitoring";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/health deployment evidence", () => {
  it("exposes the app version and effective transport policy without key values", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "configured-for-test");
    vi.stubEnv("EMBEDDING_API_KEY", "siliconflow-configured-for-test");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1");
    vi.stubEnv("KIMI_API_KEY", "legacy-moonshot-key");
    const response = GET();
    const body = await response.json();
    expect(body.appVersion).toBe(APP_VERSION);
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

  it("exposes configured release provenance and bypasses provider configuration only for liveness", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("APP_RELEASE_VERSION", "0.8.0-rc.1");
    vi.stubEnv("APP_BUILD_COMMIT", "ABCD1234567");
    const response = GET(new Request("https://jingshiroom.com/api/health?check=liveness"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      check: "liveness",
      appVersion: "0.8.0-rc.1",
      buildCommit: "abcd1234567",
    });
    expect(GET().status).toBe(503);
  });

  it("uses the Vercel commit when no explicit commit is configured", async () => {
    vi.stubEnv("APP_BUILD_COMMIT", undefined);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "1234567abcdef");
    const response = GET(new Request("https://jingshiroom.com/api/health?check=liveness"));
    expect((await response.json()).buildCommit).toBe("1234567abcdef");
  });

  it("does not echo malformed release values in the public response", async () => {
    vi.stubEnv("APP_RELEASE_VERSION", "private-invalid-value");
    vi.stubEnv("APP_BUILD_COMMIT", "private-invalid-commit");
    const response = GET(new Request("https://jingshiroom.com/api/health?check=liveness"));
    expect(await response.json()).toMatchObject({ appVersion: APP_VERSION, buildCommit: null });
  });

  it("reports no observations as unknown rather than inventing a successful model call", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "configured-for-test");
    vi.stubEnv("EMBEDDING_API_KEY", "configured-for-test");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1");
    vi.spyOn(monitoring, "getChatLlmHealth").mockReturnValue({
      healthy: null, status: "unknown", observations: 0, scope: "instance",
      consecutiveFailures: 0, recentFailures: 0,
    });
    const response = GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.conversationLlm).toMatchObject({ healthy: null, status: "unknown", scope: "instance" });
    expect(body.note).toContain("provider availability unverified");
  });

  it("rejects readiness when this instance has observed a conversation failure", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "configured-for-test");
    vi.spyOn(monitoring, "getChatLlmHealth").mockReturnValue({
      healthy: false, status: "degraded", observations: 1, scope: "instance",
      consecutiveFailures: 1, recentFailures: 1,
    });
    const response = GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, degraded: true });
  });
});
