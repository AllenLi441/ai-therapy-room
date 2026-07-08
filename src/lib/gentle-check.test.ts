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

  it("no-cue passive (sleep/panic/venting mislabel) still RELEASES — gentle_check does not re-admit FPs", () => {
    const d = decideImplicitIntercept(
      ok(res({ severity: "passive_death_wish", confidence: 0.8, pragmatic: "self", evidence: ["每天都拖到凌晨才睡"] })),
      cleanLexicon
    );
    expect(d.intercept).toBe(false);
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
