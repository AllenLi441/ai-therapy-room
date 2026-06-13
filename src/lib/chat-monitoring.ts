/**
 * ⚠️ RECOVERED-STUB (2026-06-13)
 *
 * The original `src/lib/chat-monitoring.ts` was only ever captured as a truncated
 * partial read in the transcripts (the complete version lived in a Codex
 * session), so it could not be faithfully reconstructed. The only export consumed
 * elsewhere is `getChatLlmHealth` (used by `src/app/api/health/route.ts`). This
 * stub restores a type-correct surface so the app builds; health always reports
 * healthy here.
 *
 * Restore the original to bring back real conversation-LLM fallback tracking and
 * structured chat-monitoring logs.
 */
export type ChatLlmHealth = {
  healthy: boolean;
  consecutiveFailures: number;
  recentFailures: number;
};

export function getChatLlmHealth(): ChatLlmHealth {
  return { healthy: true, consecutiveFailures: 0, recentFailures: 0 };
}

/** No-op in the stub; the original recorded conversation-LLM fallbacks. */
export function recordChatLlmFallback(_failed: boolean): void {
  // intentionally empty (stub)
}
