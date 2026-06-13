import { describe, expect, it } from "vitest";
import { scaleSafetySignal } from "./state-tags";
import type { ScaleResult } from "./types";

// P3-a ③: the frontend now sends completed self-checks to /api/chat. This proves
// the exact shape ScaleModal builds (id / total / severity / answers / completedAt)
// actually reaches and drives the backend safety layer — in particular the PHQ-9
// self-harm item (0-based index 8), which is the most safety-relevant datum a
// scale can carry. Before this change scaleResults were never sent, so none of
// this fired in production.

const phq9 = (answers: number[]): ScaleResult => ({
  id: "PHQ-9",
  total: answers.reduce((s, v) => s + v, 0),
  severity: "中度",
  answers,
  completedAt: new Date().toISOString()
});

describe("P3-a — completed scales reach the chat safety layer", () => {
  it("PHQ-9 with item 9 endorsed raises the self-harm signal", () => {
    const sig = scaleSafetySignal([phq9([1, 1, 1, 1, 0, 0, 0, 0, 2])]); // index 8 = 2
    expect(sig.selfHarmThought).toBe(true);
    expect(sig.selfHarmFrequency).toBe(2);
  });

  it("PHQ-9 without item 9 does NOT raise the self-harm signal", () => {
    const sig = scaleSafetySignal([phq9([2, 2, 2, 2, 2, 0, 0, 0, 0])]); // index 8 = 0
    expect(sig.selfHarmThought).toBe(false);
  });

  it("a severe total raises severe-distress", () => {
    const sig = scaleSafetySignal([phq9([3, 3, 3, 3, 3, 3, 1, 1, 0])]); // total 20 → severe
    expect(sig.severeDistress).toBe(true);
  });

  it("no scales → no signal (the pre-change production state)", () => {
    const sig = scaleSafetySignal([]);
    expect(sig.selfHarmThought).toBe(false);
    expect(sig.severeDistress).toBe(false);
  });
});
