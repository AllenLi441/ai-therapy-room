import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createDeepSeekTextStream, generateDeepSeekText } from "@/lib/deepseek";
import { assessImplicitRiskWithLLM } from "@/lib/implicit-risk";
import { retrieveKnowledge } from "@/lib/knowledge";
import { searchAuthoritative } from "@/lib/web-search";
import { resetRateLimitForTests } from "@/lib/rate-limit";

vi.mock("@/lib/deepseek", async (original) => ({ ...await original<typeof import("@/lib/deepseek")>(), createDeepSeekTextStream: vi.fn(), generateDeepSeekText: vi.fn() }));
vi.mock("@/lib/implicit-risk", async (original) => ({ ...await original<typeof import("@/lib/implicit-risk")>(), assessImplicitRiskWithLLM: vi.fn() }));
vi.mock("@/lib/decision-log", () => ({ appendDecisionLog: vi.fn(async () => {}), buildDecisionLogEntry: vi.fn(() => ({})) }));
vi.mock("@/lib/chat-monitoring", () => ({ recordChatLlmFallback: vi.fn() }));
vi.mock("@/lib/knowledge", () => ({ isInfoSeeking: () => false, retrieveKnowledge: vi.fn() }));
vi.mock("@/lib/web-search", () => ({ searchAuthoritative: vi.fn() }));

const DELAY = 300;
const later = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), DELAY));
const request = (content: string) => new Request("http://localhost/api/chat", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content }], language: "zh", pace: "deep" })
});
const SAFE = { kind: "ok" as const, result: { severity: "none" as const, pragmatic: "self" as const, modifiers: [], confidence: 0.9, evidence: [], suggestedFlags: [], rationale: "" } };
let order: string[];

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitForTests();
  order = [];
  vi.mocked(assessImplicitRiskWithLLM).mockImplementation(async () => { order.push("judge:start"); const r = await later(SAFE); order.push("judge:end"); return r; });
  vi.mocked(retrieveKnowledge).mockImplementation(async () => { order.push("retrieve:start"); const r = await later([]); order.push("retrieve:end"); return r; });
  vi.mocked(searchAuthoritative).mockImplementation(async () => { order.push("search"); return []; });
  vi.mocked(createDeepSeekTextStream).mockImplementation(async () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("好的。")); c.close(); } }));
  vi.mocked(generateDeepSeekText).mockRejectedValue(new Error("offline"));
});

describe("deep mode evidence timing", () => {
  it("looks up evidence while the judge decides on a turn with no danger signal", async () => {
    const started = Date.now();
    const response = await POST(request("失眠是什么？"));
    await response.text();
    expect(Date.now() - started).toBeLessThan(DELAY * 2 - 50);
    expect(order.indexOf("retrieve:start")).toBeLessThan(order.indexOf("judge:end"));
    expect(response.headers.get("Server-Timing")).toMatch(/judge;dur=\d+, evidence;dur=\d+/);
  });

  it("keeps the old order when the turn carries a soft danger cue", async () => {
    const response = await POST(request("活着好累，失眠是什么？"));
    await response.text();
    if (order.includes("retrieve:start")) expect(order.indexOf("retrieve:start")).toBeGreaterThan(order.indexOf("judge:end"));
  });

  it("never looks anything up for a turn the judge intercepts after a lexicon flag", async () => {
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValueOnce({ kind: "ok", result: { ...SAFE.result, severity: "imminent_acute", modifiers: ["means_capability"], confidence: 0.95 } });
    await (await POST(request("药都攒好了，安眠药吃多少会怎样？"))).text();
    expect(retrieveKnowledge).not.toHaveBeenCalled();
    expect(searchAuthoritative).not.toHaveBeenCalled();
  });
});

describe("output guard in the reply path", () => {
  const stream = (text: string) => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
  const send = (pace: "deep" | "fast", extra: Record<string, unknown> = {}) => POST(new Request("http://localhost/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "最近总是提不起劲" }], language: "zh", pace, ...extra })
  }));

  it.each(["deep", "fast"] as const)("withdraws a diagnosing reply in %s mode", async (pace) => {
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValue(SAFE);
    vi.mocked(createDeepSeekTextStream).mockImplementationOnce(async () => stream("听起来你这就是抑郁症，需要吃药。"));
    const text = await (await send(pace)).text();
    expect(text).toContain('"type":"retract","kind":"diagnosis"');
    expect(text).not.toContain("需要吃药");
  });

  it("checks romance only when the person is under 18", async () => {
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValue(SAFE);
    vi.mocked(createDeepSeekTextStream).mockImplementation(async () => stream("好呀，我来做你的男朋友。"));
    expect(await (await send("deep", { ageRange: "minor" })).text()).toContain('"kind":"romance"');
    expect(await (await send("deep", { ageRange: "adult" })).text()).not.toContain("retract");
  });
});
