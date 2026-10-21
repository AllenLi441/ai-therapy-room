import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createDeepSeekTextStream, generateDeepSeekText } from "@/lib/deepseek";
import { assessImplicitRiskWithLLM } from "@/lib/implicit-risk";
import { resetRateLimitForTests } from "@/lib/rate-limit";
import { EVENT_DELIM } from "@/lib/stream-markers";
import { readTurnTraceHeader } from "@/lib/turn-trace";
import { APP_VERSION } from "@/lib/version";

vi.mock("@/lib/deepseek", async (original) => ({ ...await original<typeof import("@/lib/deepseek")>(), createDeepSeekTextStream: vi.fn(), generateDeepSeekText: vi.fn() }));
vi.mock("@/lib/implicit-risk", async (original) => ({ ...await original<typeof import("@/lib/implicit-risk")>(), assessImplicitRiskWithLLM: vi.fn() }));
vi.mock("@/lib/decision-log", () => ({ appendDecisionLog: vi.fn(async () => {}), buildDecisionLogEntry: vi.fn(() => ({})) }));
vi.mock("@/lib/chat-monitoring", () => ({ recordChatLlmFallback: vi.fn() }));
vi.mock("@/lib/knowledge", () => ({ isInfoSeeking: () => false, retrieveKnowledge: vi.fn(async () => []) }));
vi.mock("@/lib/web-search", () => ({ searchAuthoritative: vi.fn(async () => []) }));

const request = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/chat", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "今天上班被领导当众批评了，心里很堵。" }], language: "zh", pace: "deep", ...extra })
});
const stream = (text: string) => new ReadableStream<Uint8Array>({
  start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); }
});
const SAFE_JUDGE = { kind: "ok" as const, result: {
  severity: "none" as const, pragmatic: "self" as const, modifiers: [], confidence: 0.9,
  evidence: ["被领导当众批评"], suggestedFlags: [], rationale: "用户说被领导当众批评", judgedBy: "deepseek" as const
} };

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitForTests();
  vi.mocked(assessImplicitRiskWithLLM).mockResolvedValue(SAFE_JUDGE);
  vi.mocked(createDeepSeekTextStream).mockImplementation(async () => stream("被当众批评，确实会很难受。"));
  vi.mocked(generateDeepSeekText).mockRejectedValue(new Error("offline"));
});

describe("turn trace for the shared dataset", () => {
  it("labels a deep model reply with its model and judge verdict, without the judge's quotes", async () => {
    const response = await POST(request());
    await response.text();
    const header = response.headers.get("X-Turn")!;
    expect(readTurnTraceHeader(header)).toMatchObject({
      v: 1, app: APP_VERSION, route: "deepseek_normal", pace: "deep", model: "deepseek-v4-pro", thinking: "off", mode: "support",
      judge: { kind: "ok", severity: "none", pragmatic: "self", confidence: 0.9, by: "deepseek" },
      decision: { intercept: false, source: "none" },
    });
    expect(readTurnTraceHeader(header)?.ms?.judge).toEqual(expect.any(Number));
    expect(decodeURIComponent(header)).not.toContain("领导");
  });

  it("sends the fast-mode judge verdict in the trailing safety event", async () => {
    const response = await POST(request({ pace: "fast" }));
    expect(readTurnTraceHeader(response.headers.get("X-Turn"))).toMatchObject({ route: "deepseek_normal", pace: "fast", model: "deepseek-flash" });
    expect(readTurnTraceHeader(response.headers.get("X-Turn"))?.judge).toBeUndefined();
    const text = await response.text();
    const event = JSON.parse(text.split(EVENT_DELIM)[1]);
    expect(event).toMatchObject({ type: "safety", status: "safe", trace: { route: "deepseek_normal", model: "deepseek-flash", judge: { kind: "ok", severity: "none" } } });
    expect(JSON.stringify(event)).not.toContain("领导");
  });

  it("marks a fixed crisis text as having no model and no judge", async () => {
    const response = await POST(request({ messages: [{ role: "user", content: "我想跳楼，活不下去了。" }] }));
    await response.text();
    const trace = readTurnTraceHeader(response.headers.get("X-Turn"));
    expect(trace).toMatchObject({ route: "lexicon_crisis" });
    expect(trace?.model).toBeUndefined();
    expect(trace?.judge).toBeUndefined();
  });

  it("flags replies written inside an active crisis session", async () => {
    const response = await POST(request({ crisisModeActive: true }));
    await response.text();
    expect(readTurnTraceHeader(response.headers.get("X-Turn"))).toMatchObject({ route: "deepseek_normal", crisis: true, thinking: "off", mode: "support" });
    const normal = await POST(request());
    expect(readTurnTraceHeader(normal.headers.get("X-Turn"))?.crisis).toBeUndefined();
  });

  it("labels the mode of the prompt actually used, not the one asked for", async () => {
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValueOnce({ kind: "ok", result: { ...SAFE_JUDGE.result, severity: "passive_death_wish", confidence: 0.3 } });
    const response = await POST(request({ messages: [{ role: "user", content: "失眠是什么？" }] }));
    await response.text();
    const prompt = vi.mocked(createDeepSeekTextStream).mock.calls.at(-1)![0].messages[0].content;
    const trace = readTurnTraceHeader(response.headers.get("X-Turn"));
    expect(trace?.mode).toBe(prompt.includes("本轮回应任务：信息问答") ? "information" : "support");
  });

  it("keeps the judge time on an implicit crisis reply", async () => {
    vi.mocked(assessImplicitRiskWithLLM).mockResolvedValueOnce({ kind: "ok", result: { ...SAFE_JUDGE.result, severity: "imminent_acute", modifiers: ["means_capability"], confidence: 0.95 } });
    const response = await POST(request({ messages: [{ role: "user", content: "今晚就是最后一次了" }] }));
    await response.text();
    const trace = readTurnTraceHeader(response.headers.get("X-Turn"));
    expect(trace?.route).toBe("implicit_crisis");
    expect(trace?.ms?.judge).toEqual(expect.any(Number));
  });

  it("labels the crisis check-in reply and boundary texts", async () => {
    const check = await POST(request({ crisisModeActive: true, messages: [{ role: "user", content: "1" }] }));
    expect(readTurnTraceHeader(check.headers.get("X-Turn"))?.route).toBe("crisis_check_reply");
    const medication = await POST(request({ messages: [{ role: "user", content: "舍曲林一天吃几片合适？" }] }));
    expect(readTurnTraceHeader(medication.headers.get("X-Turn"))).toMatchObject({ route: "lexicon_medication", judge: { kind: "ok" } });
  });
});
