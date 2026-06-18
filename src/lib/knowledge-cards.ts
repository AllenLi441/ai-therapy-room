import type { KnowledgeCard } from "./types";

/**
 * Clinical knowledge cards for retrieval-augmented counselor responses.
 *
 * ⚠️ EMPTY ON PURPOSE (P4 RAG 流①).
 * The actual clinical card CONTENT is 流② (draft / pending sign-off) and is OUT
 * OF SCOPE for this engineering change. 流② populates this array with real,
 * reviewed cards; the embedding pipeline (scripts/build-knowledge-embeddings.mjs
 * → knowledge-embeddings.generated.json) and the retrieval layer
 * (src/lib/knowledge.ts) are already wired so that adding cards + re-running
 * `npm run kb:embed` is all that's needed to turn on vector retrieval.
 *
 * With zero cards, retrieveKnowledge returns [] and the prompt falls back to
 * "没有命中特定知识卡，请使用通用支持性回应。" (generic supportive mode) — the
 * exact behaviour of the previous recovered stub, so nothing regresses.
 */
export const KNOWLEDGE_CARDS: KnowledgeCard[] = [];

/**
 * Stable text used to embed a card. Order/format is part of the contract: if
 * you change this you MUST re-run `npm run kb:embed` so the committed vectors
 * stay consistent with what queries are compared against.
 */
export function cardEmbedText(card: KnowledgeCard): string {
  return [card.title, card.content, card.keywords.join(" "), card.tags.join(" ")].join("\n");
}
