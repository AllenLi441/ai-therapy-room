import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyDeployment } from "./check-deployment.mjs";

const release = { url: "https://jingshiroom.com", version: "0.8.0", commit: "1234567abcdef" };
afterEach(() => vi.unstubAllGlobals());

function health(overrides = {}) {
  return Response.json({ ok: true, appVersion: release.version, buildCommit: release.commit, degraded: false, ...overrides });
}

describe("deployment release verifier", () => {
  it("checks both liveness and provider configuration for a release", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => health());
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyDeployment(release)).resolves.toMatchObject({ checks: ["liveness", "configuration"] });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://jingshiroom.com/api/health?check=liveness",
      "https://jingshiroom.com/api/health",
    ]);
  });

  it.each([
    [{ appVersion: "0.7.9" }, "version"],
    [{ buildCommit: "fffffff" }, "commit"],
    [{ ok: false }, "report ok"],
    [{ degraded: true }, "degraded"],
  ])("rejects stale or degraded deployments: %j", async (overrides, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => health(overrides)));
    await expect(verifyDeployment(release)).rejects.toThrow(String(expected));
  });

  it("fails on an HTTP error without printing its potentially sensitive response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream failure", { status: 503 })));
    await expect(verifyDeployment(release)).rejects.toThrow("HTTP 503");
  });

  it("allows an explicit liveness-only smoke check without provider readiness", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => health({ degraded: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyDeployment({ ...release, livenessOnly: true })).resolves.toMatchObject({ checks: ["liveness"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
