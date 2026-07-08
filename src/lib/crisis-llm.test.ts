import { describe, expect, it } from "vitest";
import {
  decideIntercept,
  hardIntercept,
  mergeWithLexicon,
  type ClassifierOutcome,
  type LlmCrisisResult
} from "./crisis-llm";
import { assessRisk } from "./safety";

function buildLlmResult(overrides: Partial<LlmCrisisResult> = {}): LlmCrisisResult {
  return {
    level: "none",
    categories: [],
    wish_to_be_dead: false,
    active_ideation_with_method: false,
    preparatory_behavior: false,
    risk_score: 0,
    signals: {
      ideation: false,
      plan: false,
      means_access: false,
      research: false,
      isolation: false,
      imminence: false,
      self_harm: false,
      harm_to_others: false,
      abuse: false,
      psychosis: false,
      final_acts: false
    },
    rationale: "",
    evidence: [],
    ...overrides
  };
}

function ok(result: LlmCrisisResult): ClassifierOutcome {
  return { kind: "ok", result };
}

describe("hardIntercept", () => {
  it("triggers on active_ideation_with_method alone", () => {
    expect(hardIntercept(buildLlmResult({ active_ideation_with_method: true }))).toBe(true);
  });

  it("triggers on preparatory_behavior alone", () => {
    expect(hardIntercept(buildLlmResult({ preparatory_behavior: true }))).toBe(true);
  });

  it("triggers on risk_score >= 3", () => {
    expect(hardIntercept(buildLlmResult({ risk_score: 3 }))).toBe(true);
    expect(hardIntercept(buildLlmResult({ risk_score: 4 }))).toBe(true);
    expect(hardIntercept(buildLlmResult({ risk_score: 5 }))).toBe(true);
  });

  it("does NOT trigger on wish_to_be_dead alone (medium risk only)", () => {
    expect(hardIntercept(buildLlmResult({ wish_to_be_dead: true, risk_score: 2 }))).toBe(false);
  });

  it("does NOT trigger on a clean result", () => {
    expect(hardIntercept(buildLlmResult())).toBe(false);
  });

  it("triggers when self_harm is currently happening", () => {
    expect(
      hardIntercept(
        buildLlmResult({ signals: { ...buildLlmResult().signals, self_harm: true } })
      )
    ).toBe(true);
  });
});

describe("decideIntercept (over-triage / fail-safe policy)", () => {
  it("lexicon-high → intercept (source: lexicon)", () => {
    const lexicon = assessRisk("我想跳楼");
    const decision = decideIntercept(ok(buildLlmResult()), lexicon);
    expect(decision.intercept).toBe(true);
    expect(decision.source).toBe("lexicon");
  });

  it("LLM hard-intercept → intercept (source: llm)", () => {
    const lexicon = assessRisk("最近真的累");
    const decision = decideIntercept(
      ok(buildLlmResult({ active_ideation_with_method: true, risk_score: 4 })),
      lexicon
    );
    expect(decision.intercept).toBe(true);
    expect(decision.source).toBe("llm");
  });

  it("classifier ERROR + lexicon >= medium → fail-safe intercept", () => {
    // "撑不下去" is in the medium suicide list — there's already smoke,
    // so a classifier outage should NOT let this through.
    const lexicon = assessRisk("最近真的撑不下去了");
    expect(lexicon.level).toBe("medium");
    const decision = decideIntercept({ kind: "error", reason: "timeout" }, lexicon);
    expect(decision.intercept).toBe(true);
    expect(decision.source).toBe("fail_safe");
  });

  it("classifier ERROR + lexicon clean → release (avoid DoS during outage)", () => {
    // Benign "我今天加班很累" must NOT be intercepted just because Kimi
    // happens to be down. Otherwise a Kimi outage blocks every user.
    const lexicon = assessRisk("最近加班很累，整个人有点疲惫。");
    expect(lexicon.level).toBe("none");
    const decision = decideIntercept({ kind: "error", reason: "overloaded" }, lexicon);
    expect(decision.intercept).toBe(false);
  });

  it("classifier NOT_CONFIGURED → no intercept (dev mode, lexicon-only)", () => {
    const lexicon = assessRisk("最近压力大");
    const decision = decideIntercept({ kind: "not_configured" }, lexicon);
    expect(decision.intercept).toBe(false);
  });

  it("clean conversation + clean LLM → no intercept", () => {
    const lexicon = assessRisk("最近压力大");
    const decision = decideIntercept(ok(buildLlmResult()), lexicon);
    expect(decision.intercept).toBe(false);
  });
});

describe("mergeWithLexicon (rationale + level aggregation)", () => {
  it("returns the lexicon assessment when LLM is null (graceful fallback)", () => {
    const lexicon = assessRisk("我想死");
    const merged = mergeWithLexicon(lexicon, null);
    expect(merged.level).toBe("high");
    expect(merged.shouldEscalate).toBe(true);
  });

  it("escalates when the LLM catches a paraphrase that the lexicon missed", () => {
    const lexicon = assessRisk("最近真的撑不住，不想再让大家担心了。");
    expect(lexicon.shouldEscalate).toBe(false);

    const llm = buildLlmResult({
      level: "high",
      categories: ["suicide"],
      wish_to_be_dead: true,
      preparatory_behavior: true,
      risk_score: 4,
      signals: {
        ideation: true,
        plan: false,
        means_access: false,
        research: false,
        isolation: true,
        imminence: false,
        self_harm: false,
        harm_to_others: false,
        abuse: false,
        psychosis: false,
        final_acts: true
      },
      rationale: "出现告别行为 + 不想拖累家人，强烈的被动死亡愿望",
      evidence: ["不想再让大家担心了"]
    });

    const merged = mergeWithLexicon(lexicon, ok(llm));

    expect(merged.level).toBe("high");
    expect(merged.shouldEscalate).toBe(true);
    expect(merged.rationale).toContain("语义判断（LLM）");
    expect(merged.rationale).toContain("不想再让大家担心了");
    expect(merged.categories).toContain("suicide");
  });

  it("does not downgrade when LLM rates lower than lexicon", () => {
    const lexicon = assessRisk("我想跳楼");
    const llm = buildLlmResult({ level: "low", rationale: "可能是修辞表达" });
    const merged = mergeWithLexicon(lexicon, ok(llm));
    expect(merged.level).toBe("high");
    expect(merged.shouldEscalate).toBe(true);
  });
});
