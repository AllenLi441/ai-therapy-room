import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createDeepSeekTextStream, generateDeepSeekText } from "@/lib/deepseek";
import { assessImplicitRiskWithLLM } from "@/lib/implicit-risk";
import { recordChatLlmFallback } from "@/lib/chat-monitoring";
import { resetRateLimitForTests } from "@/lib/rate-limit";
import { EVENT_DELIM, REASONING_OPEN, REASONING_CLOSE } from "@/lib/stream-markers";
import { createMedicalRedFlagResponse, createMedicationBoundaryResponse } from "@/lib/safety";

vi.mock("@/lib/deepseek", async (original) => ({ ...await original<typeof import("@/lib/deepseek")>(), createDeepSeekTextStream: vi.fn(), generateDeepSeekText: vi.fn() }));
vi.mock("@/lib/implicit-risk", async (original) => ({ ...await original<typeof import("@/lib/implicit-risk")>(), assessImplicitRiskWithLLM: vi.fn() }));
vi.mock("@/lib/decision-log", () => ({ appendDecisionLog: vi.fn(async () => {}), buildDecisionLogEntry: vi.fn(() => ({})) }));
vi.mock("@/lib/chat-monitoring", () => ({ recordChatLlmFallback: vi.fn() }));
vi.mock("@/lib/knowledge", () => ({ isInfoSeeking: () => false, retrieveKnowledge: vi.fn(async () => []) }));
vi.mock("@/lib/query-rewrite", () => ({ rewriteRetrievalQuery: vi.fn(async (text) => text) }));
vi.mock("@/lib/web-search", () => ({ searchAuthoritative: vi.fn(async () => []) }));
vi.mock("@/lib/chat-summary", () => ({ summarizeOlderConversation: vi.fn(async () => "") }));

const request = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/chat", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "I had a quiet day." }], language: "en", pace: "deep", ...extra })
});
function source(parts: string[], fail = false) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < parts.length) controller.enqueue(new TextEncoder().encode(parts[index++]));
      else if (fail) throw new Error("private-provider-error");
      else controller.close();
    }
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitForTests();
  vi.mocked(assessImplicitRiskWithLLM).mockResolvedValue({ kind: "not_configured" });
  vi.mocked(createDeepSeekTextStream).mockResolvedValue(source(["We can take this one step at a time."]));
  vi.mocked(generateDeepSeekText).mockRejectedValue(new Error("private-provider-error"));
});

describe("chat failures and product context", () => {
  it("returns a retryable localized 503 without exposing provider details", async () => {
    vi.mocked(createDeepSeekTextStream).mockRejectedValueOnce(new Error("private-provider-error"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ error: "provider_unavailable", retryable: true });
    expect(body.message).toContain("try again");
    expect(JSON.stringify(body)).not.toContain("private-provider-error");
    expect(recordChatLlmFallback).toHaveBeenCalledWith(true);
  });

  it("keeps partial text and sends a retryable stream event on disconnect", async () => {
    vi.mocked(createDeepSeekTextStream).mockResolvedValueOnce(source(["We can take this one step at a time."], true));
    const text = await (await POST(request())).text();
    expect(text).toContain("We can take this one step at a time.");
    expect(text).toContain(EVENT_DELIM + JSON.stringify({ type: "error", code: "provider_unavailable", message: "The reply could not be completed. Please try again; your message is still here.", retryable: true }) + EVENT_DELIM);
    expect(text).not.toContain("private-provider-error");
    expect(recordChatLlmFallback).toHaveBeenCalledTimes(1);
    expect(recordChatLlmFallback).toHaveBeenCalledWith(true);
  });

  it("closes an unfinished reasoning block before sending the error event", async () => {
    vi.mocked(createDeepSeekTextStream).mockResolvedValueOnce(source([REASONING_OPEN + "A partial thought"], true));
    const text = await (await POST(request())).text();
    expect(text).toContain(REASONING_CLOSE + EVENT_DELIM + '{"type":"error"');
  });

  it("does not treat an empty successful transport stream as a completed answer", async () => {
    vi.mocked(createDeepSeekTextStream).mockResolvedValueOnce(source([]));
    const text = await (await POST(request())).text();
    expect(text).toContain('"type":"error"');
    expect(recordChatLlmFallback).toHaveBeenCalledWith(true);
  });

  it("keeps the parallel safety tail even when the answer stream fails", async () => {
    vi.mocked(createDeepSeekTextStream).mockResolvedValueOnce(source(["A partial answer."], true));
    const text = await (await POST(request({ pace: "fast" }))).text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain('"type":"safety","status":"unchecked"');
  });

  it("preserves crisis support when a parallel judge catches danger during a provider outage", async () => {
    vi.mocked(createDeepSeekTextStream).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValueOnce({ kind: "ok", result: {
      severity: "imminent_acute", pragmatic: "self", modifiers: ["means_capability"], confidence: 0.99,
      evidence: [], suggestedFlags: [], rationale: "synthetic test"
    } });
    const response = await POST(request({ pace: "fast" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Crisis-Triggered")).toBe("1");
  });

  it("records success only after completion and passes selected context into the prompt", async () => {
    const response = await POST(request({ supportRegion: "cn", ageRange: "minor", availableScale: "PHQ-9", continuationNote: "I wanted to discuss school next time." }));
    await response.text();
    expect(recordChatLlmFallback).toHaveBeenCalledWith(false);
    const payload = vi.mocked(createDeepSeekTextStream).mock.calls[0][0];
    expect(JSON.stringify(payload)).toContain("用户自选未满18岁");
    expect(JSON.stringify(payload)).toContain("用户选择的支持地区：中国大陆");
    expect(JSON.stringify(payload)).toContain("本轮页面有 PHQ-9");
    expect(JSON.stringify(payload)).toContain("过去由用户确认的接续笔记");
    expect(vi.mocked(assessImplicitRiskWithLLM).mock.calls[0][0]).toEqual([{ role: "user", content: "I had a quiet day." }]);
  });

  it("keeps deterministic crisis support and explicit minor support if its provider fails", async () => {
    const response = await POST(request({ messages: [{ role: "user", content: "I want to kill myself" }], supportRegion: "cn", ageRange: "minor" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Reply-Fallback")).toBe("safety");
    expect(await response.text()).toContain("12355");
  });

  it("rejects malformed shapes before calling a provider", async () => {
    for (const body of [null, [], { messages: "bad" }, { messages: [null] }, { messages: [{ role: "user", content: 42 }] }]) {
      const response = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));
      expect(response.status).toBe(400);
    }
    expect(createDeepSeekTextStream).not.toHaveBeenCalled();
    expect(assessImplicitRiskWithLLM).not.toHaveBeenCalled();
  });

  it("checks the full allowed message, including risk after character 3000", async () => {
    const response = await POST(request({ messages: [{ role: "user", content: "a".repeat(3100) + " 我想自杀。" }] }));
    expect(response.headers.get("X-Crisis-Triggered")).toBe("1");
  });

  it.each(["deep", "fast"])("an active crisis with current explicit danger cannot be cleared by a safe judge in %s mode", async (pace) => {
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValueOnce({ kind: "ok", result: {
      severity: "none", pragmatic: "self", modifiers: [], confidence: 0.99,
      evidence: [], suggestedFlags: [], rationale: "synthetic mistaken safe verdict"
    } });
    const response = await POST(request({ pace, crisisModeActive: true, messages: [{ role: "user", content: "I want to kill myself." }] }));
    expect(response.headers.get("X-Crisis-Triggered")).toBe("1");
    const text = await response.text();
    expect(text).toContain('"type":"safety","status":"crisis"');
    expect(text).not.toContain('"status":"safe"');
  });

  it("does not divert a repeated explicit overdose into ordinary medication advice", async () => {
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValueOnce({ kind: "ok", result: {
      severity: "none", pragmatic: "self", modifiers: [], confidence: 0.99,
      evidence: [], suggestedFlags: [], rationale: "synthetic mistaken safe verdict"
    } });
    const response = await POST(request({ crisisModeActive: true, messages: [{ role: "user", content: "我刚刚把整瓶安眠药都吞了，应该吃多少药" }] }));
    expect(response.headers.get("X-Crisis-Triggered")).toBe("1");
    expect(await response.text()).toContain('"type":"safety","status":"crisis"');
  });

  it("sends a gentle safety event when the judge clears a tentative local concern", async () => {
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValueOnce({ kind: "ok", result: {
      severity: "none", pragmatic: "self", modifiers: [], confidence: 0.99,
      evidence: [], suggestedFlags: [], rationale: "ordinary stress"
    } });
    const response = await POST(request({ messages: [{ role: "user", content: "我快撑不住了" }] }));
    expect(response.headers.get("X-Crisis-Triggered")).toBeNull();
    expect(await response.text()).toContain('"type":"safety","status":"gentle"');
  });

  it("prioritizes current emergency symptoms over an accompanying medication request", async () => {
    const response = await POST(request({ messages: [{ role: "user", content: "我现在胸口剧痛，喘不上气，应该吃什么药" }] }));
    const text = await response.text();
    expect(text).toBe(createMedicalRedFlagResponse("en"));
    expect(text).not.toBe(createMedicationBoundaryResponse("en"));
  });
});
