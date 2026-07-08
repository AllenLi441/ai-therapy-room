import { describe, expect, it } from "vitest";
import type { ScaleResult } from "./types";
import {
  PHQ9_SELF_HARM_ITEM_INDEX,
  deriveStateTag,
  deriveStateTags,
  latestResultsPerScale,
  scaleSafetySignal
} from "./state-tags";

function phq9(total: number, answers: number[] = [], completedAt = "2026-06-08T00:00:00.000Z"): ScaleResult {
  return { id: "PHQ-9", total, severity: "x", answers, completedAt };
}

describe("deriveStateTag — band mapping mirrors scales.ts cutoffs", () => {
  it("maps PHQ-9 totals to all five bands", () => {
    expect(deriveStateTag(phq9(4))?.band).toBe("ok");
    expect(deriveStateTag(phq9(9))?.band).toBe("mild");
    expect(deriveStateTag(phq9(14))?.band).toBe("moderate");
    expect(deriveStateTag(phq9(19))?.band).toBe("modsevere");
    expect(deriveStateTag(phq9(22))?.band).toBe("severe");
  });

  it("maps GAD-7 totals (no modsevere band)", () => {
    const gad = (total: number): ScaleResult => ({ id: "GAD-7", total, severity: "x", answers: [], completedAt: "" });
    expect(deriveStateTag(gad(4))?.band).toBe("ok");
    expect(deriveStateTag(gad(9))?.band).toBe("mild");
    expect(deriveStateTag(gad(14))?.band).toBe("moderate");
    expect(deriveStateTag(gad(15))?.band).toBe("severe");
  });

  it("maps ISI totals", () => {
    const isi = (total: number): ScaleResult => ({ id: "ISI", total, severity: "x", answers: [], completedAt: "" });
    expect(deriveStateTag(isi(7))?.band).toBe("ok");
    expect(deriveStateTag(isi(14))?.band).toBe("mild");
    expect(deriveStateTag(isi(21))?.band).toBe("moderate");
    expect(deriveStateTag(isi(22))?.band).toBe("severe");
  });

  it("exposes a stable machine key with the domain prefix", () => {
    expect(deriveStateTag(phq9(12))?.key).toBe("mood_low_moderate");
  });

  it("returns null for an unimplemented scale (PCL-5)", () => {
    expect(deriveStateTag({ id: "PCL-5", total: 40, severity: "x", answers: [], completedAt: "" })).toBeNull();
  });
});

describe("deriveStateTag — flags", () => {
  it("flags severe_distress only in the severe band", () => {
    expect(deriveStateTag(phq9(19))?.flags).not.toContain("severe_distress");
    expect(deriveStateTag(phq9(20))?.flags).toContain("severe_distress");
  });

  it("flags self_harm_thought when PHQ-9 item 9 is endorsed at any frequency", () => {
    const answers = [0, 0, 0, 0, 0, 0, 0, 0, 1];
    expect(answers[PHQ9_SELF_HARM_ITEM_INDEX]).toBe(1);
    expect(deriveStateTag(phq9(8, answers))?.flags).toContain("self_harm_thought");
  });

  it("does not flag self_harm_thought when item 9 is 0", () => {
    expect(deriveStateTag(phq9(8, [0, 0, 0, 0, 0, 0, 0, 0, 0]))?.flags).not.toContain("self_harm_thought");
  });

  it("does not crash and does not flag when answers are empty/short", () => {
    expect(deriveStateTag(phq9(8, []))?.flags).not.toContain("self_harm_thought");
    expect(deriveStateTag(phq9(8, [0, 0]))?.flags).not.toContain("self_harm_thought");
  });
});

describe("latestResultsPerScale / deriveStateTags — keep newest per scale", () => {
  it("keeps only the most recent result for a repeated scale", () => {
    const older = phq9(20, [], "2026-05-01T00:00:00.000Z");
    const newer = phq9(8, [], "2026-06-08T00:00:00.000Z");
    const latest = latestResultsPerScale([older, newer]);
    expect(latest).toHaveLength(1);
    expect(latest[0].total).toBe(8);
  });

  it("derives one tag per distinct scale", () => {
    const tags = deriveStateTags([
      phq9(12),
      { id: "GAD-7", total: 16, severity: "x", answers: [], completedAt: "2026-06-08T00:00:00.000Z" }
    ]);
    expect(tags.map((t) => t.scaleId).sort()).toEqual(["GAD-7", "PHQ-9"]);
  });
});

describe("scaleSafetySignal", () => {
  it("is empty for no scales", () => {
    const signal = scaleSafetySignal([]);
    expect(signal.selfHarmThought).toBe(false);
    expect(signal.severeDistress).toBe(false);
    expect(signal.selfHarmFrequency).toBeNull();
    expect(signal.notes).toEqual([]);
  });

  it("surfaces PHQ-9 item-9 endorsement with frequency label", () => {
    const signal = scaleSafetySignal([phq9(12, [0, 0, 0, 0, 0, 0, 0, 0, 2])]);
    expect(signal.selfHarmThought).toBe(true);
    expect(signal.selfHarmFrequency).toBe(2);
    expect(signal.notes.join(" ")).toContain("一半以上的日子");
  });

  it("uses the latest PHQ-9 — a newer benign re-test clears the older endorsement", () => {
    const signal = scaleSafetySignal([
      phq9(18, [0, 0, 0, 0, 0, 0, 0, 0, 3], "2026-05-01T00:00:00.000Z"),
      phq9(6, [0, 0, 0, 0, 0, 0, 0, 0, 0], "2026-06-08T00:00:00.000Z")
    ]);
    expect(signal.selfHarmThought).toBe(false);
    expect(signal.selfHarmFrequency).toBe(0);
  });

  it("flags severeDistress from a severe-band scale", () => {
    const signal = scaleSafetySignal([{ id: "GAD-7", total: 18, severity: "x", answers: [], completedAt: "" }]);
    expect(signal.severeDistress).toBe(true);
  });
});
