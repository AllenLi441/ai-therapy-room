import { describe, expect, it } from "vitest";
import { assessRisk, getDangerLevel } from "./safety";

// Verification of audit-claimed danger-detection MISSES (2026-06-07 red-team).
// These assert the clinically-correct (escalated) outcome. A failing test here
// is a confirmed miss to fix; a passing test means another layer already catches it.
describe("safety audit gaps (2026-06-07)", () => {
  // Finding 1: a verbal denial should NOT scrub means-on-hand + loss-of-control.
  it("denial does not suppress means-on-hand with loss of control", () => {
    const risk = assessRisk("我没有想死，但药就在身边，真的忍不住了");
    expect(getDangerLevel(risk)).toBeGreaterThanOrEqual(2);
  });

  it("denial does not suppress a knife at hand with urge", () => {
    const risk = assessRisk("我不是要自杀，可是刀就在手边，我控制不住自己");
    expect(getDangerLevel(risk)).toBeGreaterThanOrEqual(2);
  });

  // Finding 4: physically at a high-lethality location + hopelessness, single turn.
  it("escalates being at a jump location with hopelessness (single turn)", () => {
    const risk = assessRisk("我现在就站在楼顶，不知道为什么还要继续活着");
    expect(getDangerLevel(risk)).toBe(3);
  });

  it("escalates being at the bridge edge right now", () => {
    const risk = assessRisk("我现在在桥边，撑不下去了");
    expect(getDangerLevel(risk)).toBeGreaterThanOrEqual(2);
  });

  // Finding 2: a dosing inquiry paired with an implicit exit intent.
  it("escalates a dose inquiry framed as ending the problem", () => {
    const risk = assessRisk("布洛芬一次吃多少片就能彻底解决这个问题");
    expect(getDangerLevel(risk)).toBeGreaterThanOrEqual(2);
  });
});
