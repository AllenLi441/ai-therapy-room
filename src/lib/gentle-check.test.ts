import { describe, it, expect } from "vitest";
import { decideImplicitIntercept, type ImplicitOutcome } from "./implicit-risk";
import { createGentleCheckResponse } from "./safety";
import type { ImplicitRiskAssessment, RiskAssessment } from "./types";

function res(o: Partial<ImplicitRiskAssessment>): ImplicitRiskAssessment {
  return {
    severity: "none",
    pragmatic: "self",
    modifiers: [],
    evidence: [],
    confidence: 0,
    suggestedFlags: [],
    rationale: "",
    ...o
  };
}
const ok = (x: ImplicitRiskAssessment): ImplicitOutcome => ({ kind: "ok", result: x });
const cleanLexicon: RiskAssessment = {
  level: "none",
  categories: [],
  matchedTerms: [],
  flags: [],
  shouldEscalate: false,
  rationale: ""
};

describe("P2 gentle_check — graded routing soft tier", () => {
  it("low-confidence (0.4–0.6) passive death-wish WITH a real cue → gentle_check, not hotlines", () => {
    const d = decideImplicitIntercept(
      ok(res({ severity: "passive_death_wish", confidence: 0.5, pragmatic: "self", evidence: ["一切都没什么意义了"] })),
      cleanLexicon
    );
    expect(d.intercept).toBe(true);
    if (d.intercept) expect(d.mode).toBe("gentle_check");
  });

  it("higher-confidence (>=0.6) passive death-wish still routes to suicide_concern", () => {
    const d = decideImplicitIntercept(
      ok(res({ severity: "passive_death_wish", confidence: 0.7, pragmatic: "self", evidence: ["一切都没什么意义了"] })),
      cleanLexicon
    );
    expect(d.intercept).toBe(true);
    if (d.intercept) expect(d.mode).toBe("suicide_concern");
  });

  it("suicidal_ideation is NOT softened to gentle_check (stays suicide_concern even at 0.5)", () => {
    const d = decideImplicitIntercept(
      ok(res({ severity: "suicidal_ideation", confidence: 0.5, pragmatic: "self", evidence: ["哈哈我去死好了"] })),
      cleanLexicon
    );
    expect(d.intercept).toBe(true);
    if (d.intercept) expect(d.mode).toBe("suicide_concern");
  });

  it("lower-confidence no-cue passive (sleep/venting mislabel) still RELEASES", () => {
    const d = decideImplicitIntercept(
      ok(res({ severity: "passive_death_wish", confidence: 0.65, pragmatic: "self", evidence: ["每天都拖到凌晨才睡"] })),
      cleanLexicon
    );
    expect(d.intercept).toBe(false);
  });

  it("confident no-cue passive gets a gentle check, never the full template", () => {
    const d = decideImplicitIntercept(
      ok(res({ severity: "passive_death_wish", confidence: 0.75, pragmatic: "self", evidence: ["要是这一觉能一直睡下去该多好"] })),
      cleanLexicon
    );
    expect(d.intercept).toBe(true);
    if (d.intercept) expect(d.mode).toBe("gentle_check");
  });

  it("burdensomeness / non-existence / not-waking evidence counts as a death cue", () => {
    for (const evidence of [
      "要是我不在了，爸妈是不是就不用这么操心了",
      "偶尔会想，要是我从没存在过，是不是谁都不用为我操心",
      "要是明天不用醒来就好了",
      "家里人为我操碎了心，要是没有我，他们能过得轻松点",
      "I feel like a burden to everyone"
    ]) {
      const d = decideImplicitIntercept(
        ok(res({ severity: "passive_death_wish", confidence: 0.75, pragmatic: "self", evidence: [evidence] })),
        cleanLexicon
      );
      expect(d.intercept, evidence).toBe(true);
    }
  });

  it("coded self-expression (emoji / euphemism) is NOT released as non-self", () => {
    const farewell = decideImplicitIntercept(
      ok(res({ severity: "plan_preparation", confidence: 0.85, pragmatic: "emoji_coded", evidence: ["朋友圈仅三天可见,今晚🪦见"] })),
      cleanLexicon
    );
    expect(farewell.intercept).toBe(true);
    if (farewell.intercept) expect(farewell.mode).toBe("crisis");
    const euphemism = decideImplicitIntercept(
      ok(res({ severity: "suicidal_ideation", confidence: 0.85, pragmatic: "coded_euphemism", evidence: ["每天想着那两个字,歹匕"] })),
      cleanLexicon
    );
    expect(euphemism.intercept).toBe(true);
    if (euphemism.intercept) expect(euphemism.mode).toBe("suicide_concern");
  });

  it("genuinely non-self forms still release", () => {
    for (const pragmatic of ["other", "quote_fictional", "sarcasm_hyperbole", "rhetorical_complaint"] as const) {
      const d = decideImplicitIntercept(
        ok(res({ severity: "suicidal_ideation", confidence: 0.85, pragmatic, evidence: ["想死"] })),
        cleanLexicon
      );
      expect(d.intercept, pragmatic).toBe(false);
    }
  });

  it("gentle_check response is warm and contains NO hotlines / NO 1-4 scale / NO lockout", () => {
    const zh = createGentleCheckResponse("一切都没什么意义", "zh");
    expect(zh).not.toContain("12356");
    expect(zh).not.toContain("988");
    expect(zh).not.toMatch(/1=|只回一个数字/);
    expect(zh).toContain("一切都没什么意义"); // echoes the cue
    const en = createGentleCheckResponse(undefined, "en");
    expect(en).not.toContain("988");
    expect(en.toLowerCase()).toContain("here");
  });
});
