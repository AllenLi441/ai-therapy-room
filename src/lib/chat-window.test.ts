import { describe, it, expect } from "vitest";
import {
  takeRecentWithinBudget,
  buildEarlierUserDigest,
  RECENT_CHAR_BUDGET,
  MAX_RECENT_MESSAGES,
  type WindowMessage
} from "./chat-window";

const u = (c: string): WindowMessage => ({ role: "user", content: c });
const a = (c: string): WindowMessage => ({ role: "assistant", content: c });

describe("takeRecentWithinBudget", () => {
  it("returns the whole conversation when it fits", () => {
    const conv = [u("一"), a("二"), u("三")];
    expect(takeRecentWithinBudget(conv)).toEqual(conv);
  });

  it("keeps only the most-recent messages within the char budget (oldest→newest)", () => {
    const big = "x".repeat(RECENT_CHAR_BUDGET); // one message ~= the whole budget
    const conv = [u("早期事实"), a(big), u("最近一句")];
    const out = takeRecentWithinBudget(conv);
    expect(out[out.length - 1].content).toBe("最近一句"); // latest always kept
    expect(out.map((m) => m.content)).not.toContain("早期事实"); // early one drops out
  });

  it("always keeps at least the latest message even if it alone exceeds budget", () => {
    const huge = "y".repeat(RECENT_CHAR_BUDGET * 2);
    const out = takeRecentWithinBudget([u("old"), u(huge)]);
    expect(out).toEqual([u(huge)]);
  });

  it("respects the hard message cap", () => {
    const conv = Array.from({ length: MAX_RECENT_MESSAGES + 20 }, (_, i) => u(`m${i}`));
    expect(takeRecentWithinBudget(conv).length).toBe(MAX_RECENT_MESSAGES);
  });
});

describe("buildEarlierUserDigest", () => {
  it("is empty when the whole conversation fits the window", () => {
    const conv = [u("a"), a("b"), u("c")];
    expect(buildEarlierUserDigest(conv, conv.length)).toBe("");
  });

  it("digests USER statements that fell outside the recent window (verbatim, user-only)", () => {
    const conv = [u("我叫小林，产品经理三年，养了猫布丁"), a("（早期回复）"), u("最近一句"), a("（最近回复）")];
    const digest = buildEarlierUserDigest(conv, 2); // recent window = last 2 messages
    expect(digest).toContain("小林");
    expect(digest).toContain("布丁");
    expect(digest).not.toContain("早期回复"); // assistant text excluded
    expect(digest).not.toContain("最近一句"); // recent window excluded
  });
});
