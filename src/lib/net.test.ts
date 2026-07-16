import { describe, expect, it, vi } from "vitest";
import { resilientFetch } from "./net";

// A connection-phase rejection as Node's global fetch surfaces it: a "fetch failed"
// TypeError whose `.cause.code` carries the real OS/undici code.
function connErr(code: string): Error {
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

// No-op backoff so the fixed 100ms delay never slows the suite.
const noSleep = async () => {};

const OK = () => new Response("ok", { status: 200 });

describe("resilientFetch — connection-phase retry", () => {
  it("① retries after 2 connect timeouts then succeeds → 3 attempts, response returned", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(connErr("UND_ERR_CONNECT_TIMEOUT"))
      .mockRejectedValueOnce(connErr("UND_ERR_CONNECT_TIMEOUT"))
      .mockResolvedValueOnce(OK());

    const res = await resilientFetch("https://api.example/chat", { method: "POST" }, { fetchImpl, sleep: noSleep });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("② 4 consecutive connection failures → throws, fetchImpl called exactly 4 times", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(connErr("ECONNREFUSED"));
    const sleep = vi.fn(noSleep);

    await expect(
      resilientFetch("https://api.example/chat", { method: "POST" }, { fetchImpl, sleep })
    ).rejects.toThrow("fetch failed");

    expect(fetchImpl).toHaveBeenCalledTimes(4); // 1 + 3 retries
    expect(sleep).toHaveBeenCalledTimes(3); // one backoff between each pair
  });

  it("③ HTTP 500 response → NOT retried at this layer (fetchImpl called once)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("boom", { status: 500 }));

    const res = await resilientFetch("https://api.example/chat", { method: "POST" }, { fetchImpl, sleep: noSleep });

    expect(res.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("④ signal already aborted → throws immediately, fetchImpl never called", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(OK());

    await expect(
      resilientFetch("https://api.example/chat", { method: "POST", signal: controller.signal }, { fetchImpl, sleep: noSleep })
    ).rejects.toThrow();

    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  it("⑤ non-connection error (TypeError with no code) → NOT retried (fetchImpl called once)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to parse body"));

    await expect(
      resilientFetch("https://api.example/chat", { method: "POST" }, { fetchImpl, sleep: noSleep })
    ).rejects.toThrow("Failed to parse body");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("also retries when the code sits directly on err.code (not wrapped in cause)", async () => {
    const bare = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(bare).mockResolvedValueOnce(OK());

    const res = await resilientFetch("https://api.example/chat", undefined, { fetchImpl, sleep: noSleep });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
