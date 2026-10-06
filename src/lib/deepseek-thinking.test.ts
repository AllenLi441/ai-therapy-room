import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeepSeekPayload, createDeepSeekTextStream } from "./deepseek";
import { reasoningEffortFor, resolveThinkingLevel } from "./model-options";
import { REASONING_CLOSE, REASONING_OPEN } from "./stream-markers";
import { resilientFetch } from "./net";
import type { ChatMessage } from "./types";

vi.mock("./net", () => ({ resilientFetch: vi.fn() }));

const u = (content: string): ChatMessage => ({ role: "user", content });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(resilientFetch).mockReset();
});

describe("thinking level → DeepSeek payload", () => {
  it("defaults to off for both paces; explicit levels pass through", () => {
    expect(resolveThinkingLevel(undefined)).toBe("off");
    expect(resolveThinkingLevel("max")).toBe("max");
    expect(resolveThinkingLevel("bogus")).toBe("off");
    expect(reasoningEffortFor("off")).toBe("none");
  });

  it("flash with an effort thinks, sends reasoning_effort and gets a thinking-sized budget", () => {
    const p = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-v4-flash", reasoningEffort: "high" });
    expect(p.thinking).toEqual({ type: "enabled" });
    expect(p.reasoning_effort).toBe("high");
    expect(p.max_tokens).toBe(8192);
  });

  it("effort none disables thinking even on pro, and omits reasoning_effort", () => {
    const p = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-v4-pro", reasoningEffort: "none" });
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p).not.toHaveProperty("reasoning_effort");
    expect(p.max_tokens).toBe(900);
  });

  it("no effort keeps the legacy behaviour for internal callers (flash never thinks)", () => {
    const p = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-v4-flash" });
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p).not.toHaveProperty("reasoning_effort");
  });
});

describe("reasoning text never leaves the server", () => {
  it("forwards only the thinking-phase markers, then the answer", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const sse = [
      { reasoning_content: "内部判断：无风险。督导要点：person-centered" },
      { reasoning_content: "继续思考" },
      { content: "我听到了。" }
    ].map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n`).join("") + "data: [DONE]\n";
    vi.mocked(resilientFetch).mockResolvedValueOnce(new Response(sse, { status: 200 }));

    const payload = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-v4-flash", reasoningEffort: "low" });
    const stream = await createDeepSeekTextStream(payload, { includeReasoning: true });
    const out = await new Response(stream).text();

    expect(out).toBe(REASONING_OPEN + REASONING_CLOSE + "我听到了。");
    expect(out).not.toContain("内部判断");
    expect(out).not.toContain("督导");
  });
});
