import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resilientFetchMock } = vi.hoisted(() => ({
  resilientFetchMock: vi.fn(),
}));

vi.mock("./net", () => ({
  resilientFetch: resilientFetchMock,
}));

import {
  buildKimiPayload,
  describeImageWithKimi,
  generateKimiText,
  getKimiConfig,
  getKimiVisionModel,
  isKimiConfigured,
} from "./kimi";

const CONFIG_KEYS = [
  "EMBEDDING_API_KEY",
  "EMBEDDING_BASE_URL",
  "KIMI_API_KEY",
  "KIMI_BASE_URL",
  "KIMI_MODEL",
  "KIMI_PROVIDER",
  "KIMI_VISION_MODEL",
  "SILICONFLOW_API_KEY",
  "SILICONFLOW_BASE_URL",
  "SILICONFLOW_KIMI_MODEL",
  "SILICONFLOW_KIMI_VISION_MODEL",
] as const;

beforeEach(() => {
  for (const key of CONFIG_KEYS) vi.stubEnv(key, "");
  resilientFetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Kimi provider configuration", () => {
  it("prefers the existing SiliconFlow embedding account over legacy Moonshot production settings", () => {
    vi.stubEnv("EMBEDDING_API_KEY", "siliconflow-key");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1");
    vi.stubEnv("KIMI_API_KEY", "legacy-moonshot-key");
    vi.stubEnv("KIMI_BASE_URL", "https://api.moonshot.cn/v1");
    vi.stubEnv("KIMI_MODEL", "moonshot-v1-32k");

    expect(getKimiConfig()).toEqual({
      provider: "siliconflow",
      apiKey: "siliconflow-key",
      baseUrl: "https://api.siliconflow.com/v1",
      model: "moonshotai/Kimi-K2.5",
    });
    expect(isKimiConfigured()).toBe(true);
  });

  it("keeps an explicit Moonshot route for isolated evaluation compatibility", () => {
    vi.stubEnv("KIMI_PROVIDER", "moonshot");
    vi.stubEnv("KIMI_API_KEY", "evaluation-moonshot-key");
    vi.stubEnv("KIMI_BASE_URL", "https://api.moonshot.cn/v1");
    vi.stubEnv("KIMI_MODEL", "moonshot-v1-8k");
    vi.stubEnv("EMBEDDING_API_KEY", "evaluation-embedding-key");

    expect(getKimiConfig()).toEqual({
      provider: "moonshot",
      apiKey: "evaluation-moonshot-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "moonshot-v1-8k",
    });
  });

  it("supports a dedicated key from the same SiliconFlow account", () => {
    vi.stubEnv("KIMI_PROVIDER", "siliconflow");
    vi.stubEnv("SILICONFLOW_API_KEY", "dedicated-siliconflow-key");
    vi.stubEnv("SILICONFLOW_BASE_URL", "https://api.siliconflow.com/v1");
    vi.stubEnv("SILICONFLOW_KIMI_MODEL", "moonshotai/Kimi-K2.5");

    expect(getKimiConfig()).toEqual({
      provider: "siliconflow",
      apiKey: "dedicated-siliconflow-key",
      baseUrl: "https://api.siliconflow.com/v1",
      model: "moonshotai/Kimi-K2.5",
    });
  });

  it("does not mistake a non-SiliconFlow embedding provider for a Kimi credential", () => {
    vi.stubEnv("EMBEDDING_API_KEY", "cloudflare-key");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.cloudflare.com/client/v4/accounts/test/ai/v1");
    vi.stubEnv("KIMI_API_KEY", "moonshot-key");

    expect(getKimiConfig().provider).toBe("moonshot");
    expect(getKimiConfig().apiKey).toBe("moonshot-key");
  });

  it("falls back safely when an embedding base URL is malformed", () => {
    vi.stubEnv("EMBEDDING_API_KEY", "not-a-kimi-key");
    vi.stubEnv("EMBEDDING_BASE_URL", "not a URL");

    expect(getKimiConfig().provider).toBe("moonshot");
    expect(isKimiConfigured()).toBe(false);
  });

  it("keeps JSON mode on the SiliconFlow Kimi text request", () => {
    vi.stubEnv("EMBEDDING_API_KEY", "siliconflow-key");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1");

    const payload = buildKimiPayload({
      systemPrompt: "Return JSON only.",
      messages: [{ role: "user", content: "判断风险" }],
      jsonMode: true,
    });

    expect(payload.model).toBe("moonshotai/Kimi-K2.5");
    expect(payload.response_format).toEqual({ type: "json_object" });
  });

  it("uses Kimi-K2.5 for SiliconFlow vision instead of a legacy Moonshot vision model", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "siliconflow-key");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1");
    vi.stubEnv("KIMI_API_KEY", "legacy-moonshot-key");
    vi.stubEnv("KIMI_VISION_MODEL", "moonshot-v1-8k-vision-preview");
    resilientFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "图片说明" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(getKimiVisionModel()).toBe("moonshotai/Kimi-K2.5");
    await expect(describeImageWithKimi({ imageDataUrl: "data:image/png;base64,AA==" })).resolves.toBe("图片说明");

    expect(resilientFetchMock).toHaveBeenCalledOnce();
    const [url, init] = resilientFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.siliconflow.com/v1/chat/completions");
    expect(init.headers).toEqual({
      Authorization: "Bearer siliconflow-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "moonshotai/Kimi-K2.5",
      messages: [{ role: "user", content: expect.any(Array) }],
    });
  });

  it("sends SiliconFlow text requests and trims the returned content", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "siliconflow-key");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1/");
    resilientFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "  result  " } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const payload = buildKimiPayload({ systemPrompt: "test", messages: [] });

    await expect(generateKimiText(payload)).resolves.toBe("result");
    expect(resilientFetchMock.mock.calls[0][0]).toBe("https://api.siliconflow.com/v1/chat/completions");
  });

  it("reports missing credentials and provider HTTP failures", async () => {
    const payload = buildKimiPayload({ systemPrompt: "test", messages: [] });
    await expect(generateKimiText(payload)).rejects.toThrow("Missing moonshot Kimi API key");

    vi.stubEnv("KIMI_API_KEY", "moonshot-key");
    resilientFetchMock.mockResolvedValue(new Response("quota exhausted", { status: 403 }));
    await expect(generateKimiText(payload)).rejects.toThrow("Kimi API error 403: quota exhausted");
  });

  it("cancels a stalled JSON body at the response timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("EMBEDDING_API_KEY", "siliconflow-key");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1");
    const cancel = vi.fn();
    resilientFetchMock.mockResolvedValue({
      ok: true,
      body: { cancel },
      json: () => new Promise(() => {}),
    });
    const payload = buildKimiPayload({ systemPrompt: "test", messages: [] });
    const pending = generateKimiText(payload, 10);
    const rejection = expect(pending).rejects.toThrow("Kimi response timed out");

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps Moonshot's legacy vision model only on an explicit Moonshot route", () => {
    vi.stubEnv("KIMI_PROVIDER", "moonshot");
    vi.stubEnv("KIMI_API_KEY", "moonshot-key");
    vi.stubEnv("KIMI_VISION_MODEL", "moonshot-v1-32k-vision-preview");

    expect(getKimiVisionModel()).toBe("moonshot-v1-32k-vision-preview");
  });

  it("surfaces missing vision credentials and provider errors", async () => {
    await expect(describeImageWithKimi({ imageDataUrl: "data:image/png;base64,AA==" })).rejects.toThrow(
      "Missing moonshot Kimi API key",
    );

    vi.stubEnv("EMBEDDING_API_KEY", "siliconflow-key");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.siliconflow.com/v1");
    resilientFetchMock.mockResolvedValue(new Response("invalid image", { status: 400 }));
    await expect(describeImageWithKimi({ imageDataUrl: "data:image/png;base64,AA==" })).rejects.toThrow(
      "Kimi vision error 400: invalid image",
    );
  });
});
