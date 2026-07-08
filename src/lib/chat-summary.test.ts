import { describe, it, expect, vi } from "vitest";

// generateDeepSeekText must NOT be invoked for an empty older-portion (no network,
// no cost when there's nothing to compact).
vi.mock("./deepseek", () => ({
  buildDeepSeekPayload: vi.fn(() => ({})),
  generateDeepSeekText: vi.fn(async () => "SHOULD_NOT_BE_CALLED")
}));

import { summarizeOlderConversation } from "./chat-summary";
import { generateDeepSeekText } from "./deepseek";

describe("summarizeOlderConversation", () => {
  it("returns '' and makes no LLM call when there is nothing older to compact", async () => {
    const out = await summarizeOlderConversation([], "zh");
    expect(out).toBe("");
    expect(generateDeepSeekText).not.toHaveBeenCalled();
  });

  it("calls the model and returns the trimmed summary when older messages exist", async () => {
    (generateDeepSeekText as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("  来访者小林，产品经理三年。  ");
    const out = await summarizeOlderConversation([{ role: "user", content: "我叫小林" }], "zh");
    expect(out).toBe("来访者小林，产品经理三年。");
    expect(generateDeepSeekText).toHaveBeenCalledOnce();
  });
});
