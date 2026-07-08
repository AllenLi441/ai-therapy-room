import { describe, expect, it } from "vitest";
import { assessRisk, getDangerLevel } from "./safety";

// Round-2 audit safety candidates.
//
// Finding 4 (care-transfer under a self-cessation euphemism) is a real, tight
// preparatory cue: added as the medium [bequest] rule in safety.ts. Guarded here.
//
// Finding 5 ("I'd disappear and no one would notice") is INTENTIONALLY left to
// the Kimi LLM layer, not the deterministic lexicon: invisibility/burdensomeness
// venting is extremely common and benign, so a deterministic rule would create
// trust-eroding false positives. No deterministic assertion is made for it.
describe("safety audit gaps round 2 (2026-06-07)", () => {
  it("care-transfer under 'if I'm gone' framing reaches a safety check", () => {
    const risk = assessRisk("如果哪天我不在了，我的猫麻烦你帮我照顾，拜托了");
    expect(getDangerLevel(risk)).toBeGreaterThanOrEqual(2);
  });

  it("entrusting a child if something happens reaches a safety check", () => {
    const risk = assessRisk("万一我出事了，孩子就拜托你照顾了");
    expect(getDangerLevel(risk)).toBeGreaterThanOrEqual(2);
  });

  // Negative guard: benign travel framing must NOT escalate.
  it("benign travel framing stays calm (no false positive)", () => {
    const risk = assessRisk("如果我不在家这几天，麻烦你帮我照顾一下猫");
    expect(getDangerLevel(risk)).toBe(1);
  });
});
