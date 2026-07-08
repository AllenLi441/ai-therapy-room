import { describe, expect, it } from "vitest";
import {
  decideImplicitIntercept,
  mergeImplicitWithLexicon,
  type ImplicitOutcome
} from "./implicit-risk";
import { assessRisk } from "./safety";
import type { ImplicitRiskAssessment, RiskAssessment } from "./types";

function build(overrides: Partial<ImplicitRiskAssessment> = {}): ImplicitRiskAssessment {
  return {
    severity: "none",
    pragmatic: "self",
    modifiers: [],
    evidence: [],
    confidence: 0,
    suggestedFlags: [],
    rationale: "",
    ...overrides
  };
}

function ok(result: ImplicitRiskAssessment): ImplicitOutcome {
  return { kind: "ok", result };
}

describe("decideImplicitIntercept — over-triage policy", () => {
  it("imminent_acute always fires CRISIS, even at low confidence", () => {
    const lex = assessRisk("最近压力很大");
    const decision = decideImplicitIntercept(
      ok(build({ severity: "imminent_acute", confidence: 0.2, pragmatic: "self" })),
      lex
    );
    expect(decision.intercept).toBe(true);
    if (decision.intercept) {
      expect(decision.mode).toBe("crisis");
      expect(decision.source).toBe("llm");
    }
  });

  it("plan_preparation at conf >= 0.4 fires CRISIS", () => {
    const lex = assessRisk("最近压力很大");
    const decision = decideImplicitIntercept(
      ok(build({ severity: "plan_preparation", confidence: 0.6, pragmatic: "self" })),
      lex
    );
    expect(decision.intercept).toBe(true);
    if (decision.intercept) expect(decision.mode).toBe("crisis");
  });

  it("passive_death_wish WITH lexicon corroboration → full SUICIDE_CONCERN", () => {
    const lex = assessRisk("活着好累"); // lexicon already flags suicide_concern
    const decision = decideImplicitIntercept(
      ok(build({ severity: "passive_death_wish", confidence: 0.7, pragmatic: "self" })),
      lex
    );
    expect(decision.intercept).toBe(true);
    if (decision.intercept) expect(decision.mode).toBe("suicide_concern");
  });

  it("suicidal_ideation WITH lexicon corroboration → full SUICIDE_CONCERN", () => {
    const lex = assessRisk("如果我不在了，大家应该会轻松一点"); // lexicon flags suicide_concern
    const decision = decideImplicitIntercept(
      ok(build({ severity: "suicidal_ideation", confidence: 0.5, pragmatic: "self" })),
      lex
    );
    expect(decision.intercept).toBe(true);
    if (decision.intercept) expect(decision.mode).toBe("suicide_concern");
  });

  it("passive_death_wish + hard modifier (means_capability) → full SUICIDE_CONCERN even if lexicon is clean", () => {
    const lex = assessRisk("我好伤心"); // lexicon clean, but the judge saw a means cue
    const decision = decideImplicitIntercept(
      ok(build({ severity: "passive_death_wish", confidence: 0.7, pragmatic: "self", modifiers: ["means_capability"] })),
      lex
    );
    expect(decision.intercept).toBe(true);
    if (decision.intercept) expect(decision.mode).toBe("suicide_concern");
  });

  it("JUDGE-ONLY passive_death_wish + a real cue at LOW confidence (0.5) → GENTLE_CHECK, not the grading block", () => {
    const lex = assessRisk("我好伤心"); // lexicon clean — the over-triage case
    const decision = decideImplicitIntercept(
      ok(build({ severity: "passive_death_wish", confidence: 0.5, pragmatic: "self", evidence: ["一切都没什么意义了"] })),
      lex
    );
    expect(decision.intercept).toBe(true);
    if (decision.intercept) expect(decision.mode).toBe("gentle_check");
  });

  it("JUDGE-ONLY passive_death_wish with NO death cue (judge mislabeled plain venting) → RELEASE", () => {
    const lex = assessRisk("我好伤心"); // lexicon clean
    const decision = decideImplicitIntercept(
      ok(build({ severity: "passive_death_wish", confidence: 0.8, pragmatic: "self", evidence: ["我好伤心", "最近老是睡不着"] })),
      lex
    );
    expect(decision.intercept).toBe(false); // no real death cue → not re-admitted as a crisis
  });

  it("pragmatic=other never intercepts on implicit alone (lexicon may still escalate)", () => {
    const lex = assessRisk("最近压力很大"); // lexicon-low
    const decision = decideImplicitIntercept(
      ok(build({ severity: "plan_preparation", confidence: 0.9, pragmatic: "other" })),
      lex
    );
    expect(decision.intercept).toBe(false);
  });

  it("pragmatic=sarcasm_hyperbole releases", () => {
    const lex = assessRisk("最近压力很大");
    const decision = decideImplicitIntercept(
      ok(build({ severity: "suicidal_ideation", confidence: 0.9, pragmatic: "sarcasm_hyperbole" })),
      lex
    );
    expect(decision.intercept).toBe(false);
  });

  it("low confidence (< 0.4) for non-imminent severity releases", () => {
    const lex = assessRisk("最近压力很大");
    const decision = decideImplicitIntercept(
      ok(build({ severity: "passive_death_wish", confidence: 0.2, pragmatic: "self" })),
      lex
    );
    expect(decision.intercept).toBe(false);
  });

  it("not_configured releases (dev mode)", () => {
    const lex = assessRisk("最近压力很大");
    const decision = decideImplicitIntercept({ kind: "not_configured" }, lex);
    expect(decision.intercept).toBe(false);
  });

  it("error + lexicon=none releases (avoid Kimi-outage DoS)", () => {
    const lex = assessRisk("今天吃了披萨");
    expect(lex.level).toBe("none");
    const decision = decideImplicitIntercept({ kind: "error", reason: "timeout" }, lex);
    expect(decision.intercept).toBe(false);
  });

  // Crisis false-positive fix: on a Kimi error, a GENERIC low hit from everyday
  // distress (压力/焦虑/失眠) must NOT auto-escalate to the suicide template. The
  // old fail-safe did, so any anxious message during a Kimi hiccup got a suicide
  // intervention — "cry wolf". We now defer to the deterministic lexicon's call.
  it("error + GENERIC lexicon=low (anxiety/stress/insomnia) → release, NOT a suicide template", () => {
    const lex = assessRisk("最近压力很大，焦虑得睡不着");
    expect(lex.level).toBe("low");
    expect(lex.flags).not.toContain("suicide_concern");
    const decision = decideImplicitIntercept({ kind: "error", reason: "timeout" }, lex);
    expect(decision.intercept).toBe(false);
    expect(decision.source).toBe("fail_safe_release");
  });

  // …but the floor still holds: if the deterministic lexicon itself marked the low
  // message as suicide-adjacent, a Kimi error still conservatively escalates.
  it("error + lexicon=low but SUICIDE-ADJACENT → still escalates (floor preserved)", () => {
    const lex: RiskAssessment = {
      level: "low",
      categories: ["self_harm"],
      matchedTerms: [],
      flags: ["suicide_concern"],
      shouldEscalate: false,
      rationale: "synthetic low-but-suicide-adjacent"
    };
    const decision = decideImplicitIntercept({ kind: "error", reason: "timeout" }, lex);
    expect(decision.intercept).toBe(true);
    if (decision.intercept) {
      expect(decision.mode).toBe("suicide_concern");
      expect(decision.source).toBe("fail_safe");
    }
  });

  it("error + lexicon already medium → release (lexicon's flow handles it)", () => {
    const lex = assessRisk("如果我不在了，大家应该会轻松一点吧");
    expect(lex.level).toBe("medium");
    const decision = decideImplicitIntercept({ kind: "error", reason: "timeout" }, lex);
    expect(decision.intercept).toBe(false);
  });
});

describe("mergeImplicitWithLexicon — severity-monotone", () => {
  it("LLM cannot downgrade the lexicon's level", () => {
    const lex = assessRisk("我想跳楼"); // lexicon: high
    const merged = mergeImplicitWithLexicon(
      lex,
      ok(build({ severity: "none", pragmatic: "sarcasm_hyperbole" }))
    );
    expect(merged.level).toBe("high");
    expect(merged.shouldEscalate).toBe(true);
  });

  it("LLM bumps level when implicit severity is higher", () => {
    const lex = assessRisk("今天压力大"); // lexicon-low
    const merged = mergeImplicitWithLexicon(
      lex,
      ok(build({ severity: "plan_preparation", pragmatic: "self", confidence: 0.7 }))
    );
    expect(merged.level).toBe("high");
    expect(merged.shouldEscalate).toBe(true);
  });

  it("pragmatic=other does NOT raise level (the user isn't the at-risk person)", () => {
    const lex = assessRisk("今天压力大");
    const merged = mergeImplicitWithLexicon(
      lex,
      ok(build({ severity: "plan_preparation", pragmatic: "other", confidence: 0.9 }))
    );
    expect(merged.level).toBe("low"); // unchanged
  });

  it("attaches the implicit assessment for downstream prompt context", () => {
    const lex = assessRisk("今天压力大");
    const implicit = build({
      severity: "passive_death_wish",
      pragmatic: "self",
      modifiers: ["hopelessness", "burdensomeness"],
      evidence: ["现在感觉一切都没什么意义了"],
      confidence: 0.8,
      suggestedFlags: ["suicide_concern"],
      rationale: "强烈的被动死亡愿望"
    });
    const merged = mergeImplicitWithLexicon(lex, ok(implicit));
    expect(merged.implicit).toBeDefined();
    expect(merged.implicit?.modifiers).toContain("burdensomeness");
    expect(merged.flags).toContain("suicide_concern");
    expect(merged.rationale).toContain("现在感觉一切都没什么意义了");
  });

  it("returns lexicon unchanged when LLM is not_configured or error", () => {
    const lex = assessRisk("今天压力大");
    const noConfig = mergeImplicitWithLexicon(lex, { kind: "not_configured" });
    const errored = mergeImplicitWithLexicon(lex, { kind: "error", reason: "boom" });
    expect(noConfig).toEqual(lex);
    expect(errored).toEqual(lex);
  });

  it("never adds flags when pragmatic !== self", () => {
    const lex = assessRisk("今天压力大");
    const merged = mergeImplicitWithLexicon(
      lex,
      ok(
        build({
          severity: "suicidal_ideation",
          pragmatic: "other",
          confidence: 0.9,
          suggestedFlags: ["suicide_concern"]
        })
      )
    );
    expect(merged.flags).not.toContain("suicide_concern");
  });
});
