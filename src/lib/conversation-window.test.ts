import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types";
import { sanitizeConversation } from "./conversation-window";

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });

describe("sanitizeConversation", () => {
  it("drops empty/whitespace turns and non-chat roles", () => {
    const out = sanitizeConversation([
      u("  你好  "),
      a(""),
      a("   "),
      { role: "system" as ChatMessage["role"], content: "ignore me" },
      u("还在")
    ]);
    expect(out).toEqual([
      { role: "user", content: "你好" },
      { role: "user", content: "还在" }
    ]);
  });

  it("truncates each message to the per-message cap", () => {
    const out = sanitizeConversation([u("x".repeat(5000))], { perMessageCap: 3000 });
    expect(out[0].content).toHaveLength(3000);
  });

  it("keeps far more than the old fixed 16 short turns (the amnesia fix)", () => {
    const many = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? u(`问${i}`) : a(`答${i}`)));
    const out = sanitizeConversation(many);
    // Total chars are tiny, so all 30 fit — the old slice(-16) would keep 16.
    expect(out).toHaveLength(30);
    expect(out[0].content).toBe("问0");
    expect(out[out.length - 1].content).toBe("答29");
  });

  it("stops at the character budget, keeping the most recent turns", () => {
    const out = sanitizeConversation([u("aaa"), a("bbb"), u("ccc"), a("ddd")], {
      maxChars: 10,
      maxCount: 100
    });
    // From the newest: ddd+ccc+bbb = 9 ≤ 10; adding aaa → 12 > 10, stop.
    expect(out.map((m) => m.content)).toEqual(["bbb", "ccc", "ddd"]);
  });

  it("enforces the message-count backstop", () => {
    const flood = Array.from({ length: 50 }, (_, i) => u(`第${i}`));
    const out = sanitizeConversation(flood, { maxChars: 1_000_000, maxCount: 40 });
    expect(out).toHaveLength(40);
    expect(out[out.length - 1].content).toBe("第49");
  });

  it("always keeps the most recent turn even if it alone exceeds the budget", () => {
    const out = sanitizeConversation([u("旧"), a("y".repeat(500))], { maxChars: 10 });
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("assistant");
  });

  it("preserves chronological order", () => {
    const out = sanitizeConversation([u("1"), a("2"), u("3")]);
    expect(out.map((m) => m.content)).toEqual(["1", "2", "3"]);
  });
});
