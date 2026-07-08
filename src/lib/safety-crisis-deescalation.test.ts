import { describe, expect, it } from "vitest";
import { assessRisk, createCrisisResponse, detectActiveCrisisFromHistory } from "./safety";
import type { ChatMessage } from "./types";

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });
// A real crisis template carries the markers detectActiveCrisisFromHistory looks for.
const CRISIS_AI = a(createCrisisResponse(assessRisk("我想死")));

function afterCrisis(...userReplies: string[]): ChatMessage[] {
  return [u("我想死。"), CRISIS_AI, ...userReplies.map(u)];
}

describe("detectActiveCrisisFromHistory — conservative de-escalation", () => {
  it("releases on a clear safety affirmation (zh)", () => {
    const r = detectActiveCrisisFromHistory(afterCrisis("我安全了，谢谢你陪我"));
    expect(r.active).toBe(false);
    expect(r.deescalated).toBe(true);
  });

  it("releases on '我好多了' and on English 'I'm safe now'", () => {
    expect(detectActiveCrisisFromHistory(afterCrisis("我现在好多了")).deescalated).toBe(true);
    expect(detectActiveCrisisFromHistory(afterCrisis("I'm safe now, thank you")).deescalated).toBe(true);
  });

  it("does NOT release on a bare '1' crisis-action ack (still in crisis)", () => {
    const r = detectActiveCrisisFromHistory(afterCrisis("1"));
    expect(r.active).toBe(true);
    expect(r.deescalated).toBe(false);
  });

  it("does NOT release while the user is still distressed", () => {
    const r = detectActiveCrisisFromHistory(afterCrisis("我现在不知道该怎么办"));
    expect(r.active).toBe(true);
    expect(r.deescalated).toBe(false);
  });

  it("a safety phrase paired with a hard self-harm core does NOT release (re-escalation wins)", () => {
    const r = detectActiveCrisisFromHistory(afterCrisis("我好多了，但其实还是想死"));
    expect(r.active).toBe(true);
    expect(r.deescalated).toBe(false);
  });

  it("no recent crisis marker → neither active nor de-escalated", () => {
    const r = detectActiveCrisisFromHistory([u("今天加班好累"), a("辛苦了"), u("是啊")]);
    expect(r.active).toBe(false);
    expect(r.deescalated).toBe(false);
  });
});
