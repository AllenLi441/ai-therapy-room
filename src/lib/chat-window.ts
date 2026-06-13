// Conversation-window management for the (stateless) DeepSeek chat API.
//
// DeepSeek keeps NO server-side memory: every turn we re-send the history and it
// reads it fresh. "Remembering dozens of turns" is therefore entirely about how
// much we choose to re-send. We do two things instead of a fixed message cap:
//   1. takeRecentWithinBudget — keep as many recent turns as fit a char budget
//      (dozens of short therapy turns), so recent context is verbatim and rich;
//   2. buildEarlierUserDigest — compress the USER statements that scrolled past
//      the window into a compact facts list injected into the system prompt, so
//      identity/situation facts (name, job, "做了三年", a pet's name) survive
//      indefinitely. A concise facts list recalls more reliably than a giant raw
//      window (which the model can lose in the middle) and costs far less.

export type WindowMessage = { role: "user" | "assistant"; content: string };

// Sized for the deepseek-v4 context (~64K tokens, the "六万" ceiling) with real
// headroom: the request also carries the system prompt (persona + turnPlan +
// caseMap + knowledge + the digest below, ~6–9K tokens) and the model's output
// (~1K). Treating 1 char ≈ 1 token (Chinese worst case), a 40000-char window is
// ~40K tokens, leaving ~15K margin under 64K — so a long chat won't overflow.
//
// OVERFLOW IS THE FAILURE MODE TO AVOID: exceeding the model's context makes the
// provider reject the request → empty stream → "stuck"/blank reply. That's why we
// stay under the ceiling rather than maxing it. Tune via env without a redeploy:
//   QUIET_ROOM_CHAT_CHAR_BUDGET=56000  (push higher if the proxy is 128K)
//   QUIET_ROOM_CHAT_CHAR_BUDGET=24000  (dial back if you ever see blank replies)
const DEFAULT_RECENT_CHAR_BUDGET = 40000;
const ENV_BUDGET = Number(process.env.QUIET_ROOM_CHAT_CHAR_BUDGET);
export const RECENT_CHAR_BUDGET =
  Number.isFinite(ENV_BUDGET) && ENV_BUDGET > 0 ? ENV_BUDGET : DEFAULT_RECENT_CHAR_BUDGET;
export const MAX_RECENT_MESSAGES = 200; // hard count cap (matches the sanitize bound); the char budget binds first for normal text
export const EARLIER_DIGEST_BUDGET = 3000;

// Keep the most-recent messages that fit the char budget (always at least the
// latest), returned oldest→newest. This is the slice we re-send to DeepSeek.
export function takeRecentWithinBudget(all: WindowMessage[]): WindowMessage[] {
  const out: WindowMessage[] = [];
  let chars = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    if (out.length >= MAX_RECENT_MESSAGES) break;
    const len = all[i].content.length;
    if (out.length > 0 && chars + len > RECENT_CHAR_BUDGET) break;
    out.push(all[i]);
    chars += len;
  }
  return out.reverse();
}

// Compact digest of USER statements OUTSIDE the recent window — verbatim (no LLM,
// no distortion of names/numbers), earliest-first (setup facts live there),
// budget-capped. Returns "" when the whole conversation already fits the window.
export function buildEarlierUserDigest(all: WindowMessage[], recentCount: number): string {
  if (recentCount >= all.length) return "";
  const earlier = all.slice(0, all.length - recentCount);
  const userMsgs = earlier
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (!userMsgs.length) return "";
  let digest = userMsgs.map((c) => `- ${c}`).join("\n");
  if (digest.length > EARLIER_DIGEST_BUDGET) {
    digest = `${digest.slice(0, EARLIER_DIGEST_BUDGET)} …（更早内容略）`;
  }
  return digest;
}
