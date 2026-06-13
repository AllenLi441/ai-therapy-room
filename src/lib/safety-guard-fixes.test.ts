import { describe, it, expect } from "vitest";
import { assessRisk, createCrisisResponse, detectActiveCrisisFromHistory } from "./safety";
import type { ChatMessage } from "./types";

const u = (c: string): ChatMessage => ({ role: "user", content: c });
const a = (c: string): ChatMessage => ({ role: "assistant", content: c });
const CRISIS_AI = a(createCrisisResponse(assessRisk("我想死")));
const afterCrisis = (...replies: string[]): ChatMessage[] => [u("我想死。"), CRISIS_AI, ...replies.map(u)];

describe("P4-A1 — objective-preparation labels survive a denial; denials still release", () => {
  // NOTE: the "denial + independent passive death wish" case (e.g. 我没有自杀想法，只是
  // 希望自己不要醒来) is intentionally NOT caught here. Overriding the denial filter for
  // all medium+/suicide_concern signals defeats the filter and fails the FP gate; that
  // ambivalence case is the implicit (Kimi) classifier's job. A1's deterministic part is
  // only the objective-label carve-out (means/imminence survive a verbal denial).
  it("still releases a pure screening denial with no independent risk signal", () => {
    expect(assessRisk("医生问我，我没有自杀或自伤想法").level).toBe("none");
    expect(assessRisk("我不想伤害自己，今天就是来做个常规心理测评").level).toBe("none");
  });
});

describe("P4-A3 — a calm affirmation cannot release crisis while means are on-hand", () => {
  it("stays in crisis when a de-escalation phrase co-occurs with means still on-hand", () => {
    expect(detectActiveCrisisFromHistory(afterCrisis("我好多了，药还在床边")).deescalated).toBe(false);
    expect(detectActiveCrisisFromHistory(afterCrisis("I feel better now, the pills are still next to me")).deescalated).toBe(false);
  });

  it("still releases when means are disposed (carve-out) or no means mentioned", () => {
    // disposal carve-out: means-on-hand phrase BUT also a removal clause → release
    expect(detectActiveCrisisFromHistory(afterCrisis("我好多了，药还在床边但已经交给室友拿走了")).deescalated).toBe(true);
    // no means mentioned at all → release
    expect(detectActiveCrisisFromHistory(afterCrisis("我安全了，谢谢你陪我")).deescalated).toBe(true);
  });
});
