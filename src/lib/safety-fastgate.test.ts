import { describe, expect, it } from "vitest";
import { hasImplicitSuspicion } from "./safety";

// Task C — fast-mode front gate. hasImplicitSuspicion reuses IMPLICIT_SUSPICIOUS_TERMS
// (no new lexicon entries) to decide whether a turn must be downgraded from the
// parallel fast path to the blocking judge flow. See route.ts's fast-path gate.
describe("hasImplicitSuspicion — fast-mode soft-cue front gate", () => {
  it("把猫送给闺蜜了 → true (farewell behavior cue)", () => {
    expect(hasImplicitSuspicion("把猫送给闺蜜了")).toBe(true);
  });

  it("今晚就我一个人 → true (isolation/imminence cue)", () => {
    expect(hasImplicitSuspicion("今晚就我一个人")).toBe(true);
  });

  it("今天天气不错 → false (benign)", () => {
    expect(hasImplicitSuspicion("今天天气不错")).toBe(false);
  });

  it("想清楚了，比之前轻松很多 → true (calm-before-storm closure cue)", () => {
    expect(hasImplicitSuspicion("想清楚了，比之前轻松很多")).toBe(true);
  });
});
