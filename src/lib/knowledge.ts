import type { KnowledgeCard } from "./types";

/**
 * ⚠️ RECOVERED-STUB (2026-06-13)
 *
 * The original `src/lib/knowledge.ts` was NOT present in any Claude Code or
 * Codex transcript on this machine and could not be reconstructed. This stub
 * restores a buildable, type-correct surface so the rest of the app compiles
 * and runs.
 *
 * Behaviour: returns no knowledge cards, so `buildCounselorSystemPrompt` falls
 * back to "没有命中特定知识卡，请使用通用支持性回应。" (generic supportive mode).
 *
 * To fully restore retrieval-augmented responses, replace this with the
 * original knowledge-base lookup (signature: query string + top-k count →
 * KnowledgeCard[]).
 */
export function retrieveKnowledge(_query: string, _limit = 4): KnowledgeCard[] {
  return [];
}
