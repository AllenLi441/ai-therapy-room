import { describe, expect, it } from "vitest";
import { MAX_ALTERNATIVES, encodeTurnTrace, isCrisisMessage, judgeTrace, parseReplyAlternatives, parseTurnTrace, readTurnTraceHeader, type TurnTrace } from "./turn-trace";

const base: TurnTrace = { v: 1, app: "1.3.0", route: "deepseek_normal", pace: "deep" };

describe("turn trace", () => {
  it("round-trips through the header", () => {
    const trace: TurnTrace = { ...base, model: "deepseek-v4-pro", thinking: "off", mode: "support", refs: ["ref-sleep", "web:www.nhs.uk"],
      judge: { kind: "ok", severity: "none", pragmatic: "self", confidence: 0.8, by: "deepseek" }, decision: { intercept: false, source: "none" }, ms: { judge: 1600, evidence: 40 } };
    expect(readTurnTraceHeader(encodeTurnTrace(trace))).toEqual(trace);
  });

  it("keeps only known fields and values", () => {
    expect(parseTurnTrace({ ...base, prompt: "secret", model: "gpt-x", thinking: "huge", refs: ["ok-id", "含中文", "a b", 3],
      judge: { kind: "ok", severity: "made_up", confidence: 7, rationale: "quotes the user" }, ms: { judge: -1, evidence: 1e9 } }))
      .toEqual({ ...base, refs: ["ok-id"], judge: { kind: "ok" }, ms: { evidence: 120_000 } });
  });

  it("rejects a trace without a valid route, pace or version", () => {
    expect(parseTurnTrace({ ...base, route: "anything" })).toBeUndefined();
    expect(parseTurnTrace({ ...base, pace: "slow" })).toBeUndefined();
    expect(parseTurnTrace({ ...base, app: "dev" })).toBeUndefined();
    expect(readTurnTraceHeader("%E0%A4%A")).toBeUndefined();
    expect(readTurnTraceHeader("x".repeat(5000))).toBeUndefined();
  });

  it("never carries the judge's rationale or evidence quotes", () => {
    const parts = judgeTrace(
      { kind: "ok", result: { severity: "passive_death_wish", pragmatic: "self", modifiers: [], evidence: ["原话"], confidence: 0.7, suggestedFlags: [], rationale: "原话说明" } },
      { intercept: true, mode: "gentle_check", source: "llm", rationale: "原话说明" });
    expect(JSON.stringify(parts)).not.toContain("原话");
    expect(parts).toEqual({ judge: { kind: "ok", severity: "passive_death_wish", pragmatic: "self", confidence: 0.7 }, decision: { intercept: true, mode: "gentle_check", source: "llm" } });
  });

  it("keeps the crisis-session flag and recognizes crisis replies without a safety event", () => {
    expect(parseTurnTrace({ ...base, crisis: true })?.crisis).toBe(true);
    expect(parseTurnTrace({ ...base, crisis: "yes" })?.crisis).toBeUndefined();
    expect(isCrisisMessage({ meta: { ...base, route: "lexicon_crisis" } })).toBe(true);
    expect(isCrisisMessage({ meta: { ...base, route: "crisis_check_reply" } })).toBe(true);
    expect(isCrisisMessage({ meta: { ...base, decision: { intercept: true, mode: "suicide_concern", source: "llm" } } })).toBe(true);
    expect(isCrisisMessage({ meta: { ...base, crisis: true } })).toBe(true);
    expect(isCrisisMessage({ safety: "crisis" })).toBe(true);
    expect(isCrisisMessage({ safety: "gentle", meta: { ...base, route: "implicit_gentle_check" } })).toBe(false);
    expect(isCrisisMessage({ meta: base })).toBe(false);
  });

  it("keeps the latest replaced replies with their trace and feedback", () => {
    const list = parseReplyAlternatives([
      ...Array.from({ length: 4 }, (_, i) => ({ content: `reply ${i}`, meta: base, feedback: "down", extra: 1 })),
      { content: "  " }, "not a row",
    ]);
    expect(list).toHaveLength(MAX_ALTERNATIVES);
    expect(list?.[0]).toEqual({ content: "reply 1", meta: base, feedback: "down" });
    expect(parseReplyAlternatives([])).toBeUndefined();
  });
});
