import type { ChatMessage } from "./types";

export type ConversationWindowOptions = {
  /** Hard cap on total characters of retained message content. */
  maxChars?: number;
  /** Hard cap on retained message count — backstop against a flood of tiny turns. */
  maxCount?: number;
  /** Per-message truncation length. */
  perMessageCap?: number;
};

// DeepSeek-chat has a 64K-token context. A 16,000-char history (≤ ~16K tokens
// worst case) plus the system prompt and the 900-token reply leaves a wide
// margin, so this is safe while being far more generous than the old fixed
// slice(-16). Note 16,000 chars is also SMALLER than the previous worst case of
// 16 messages × 3,000 chars, so the planner/prompt never bloat past before.
const DEFAULTS: Required<ConversationWindowOptions> = {
  maxChars: 16000,
  maxCount: 40,
  perMessageCap: 3000
};

/**
 * Filter to clean user/assistant turns, then keep as many of the MOST RECENT
 * turns as fit within a character budget — not a fixed count.
 *
 * Why budget, not count: therapy messages are usually short (a sentence or
 * two), so the old slice(-16) discarded context the model had ample room for.
 * After a long session the assistant "forgot" anything older than 8 exchanges
 * and replied as if amnesiac ("對話過多後像失憶"). Budgeting by characters keeps
 * many short turns (much more memory) while still bounding a few very long
 * turns (no context overflow). Returned in chronological order.
 *
 * Safety classifiers are unaffected: assessConversationRisk re-slices to the
 * last 4 user turns and the implicit-risk LLM re-slices to the last 8 turns, so
 * widening this outer window does not change what they see.
 */
export function sanitizeConversation(
  messages: ChatMessage[],
  options: ConversationWindowOptions = {}
): { role: "user" | "assistant"; content: string }[] {
  const { maxChars, maxCount, perMessageCap } = { ...DEFAULTS, ...options };

  const clean = messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, perMessageCap)
    }));

  const selected: { role: "user" | "assistant"; content: string }[] = [];
  let usedChars = 0;
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    const turn = clean[i];
    if (selected.length >= maxCount) break;
    // Always keep at least the most recent turn, even if it alone exceeds the
    // budget; only stop adding OLDER turns once the budget is full.
    if (selected.length > 0 && usedChars + turn.content.length > maxChars) break;
    selected.push(turn);
    usedChars += turn.content.length;
  }

  return selected.reverse();
}
