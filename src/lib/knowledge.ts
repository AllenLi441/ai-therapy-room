import type { KnowledgeCard } from "./types";
import type { EmbeddingProvider } from "./embeddings";
import { getEmbeddingProvider } from "./embeddings";
import { KNOWLEDGE_CARDS, cardEmbedText } from "./knowledge-cards";
import generated from "./knowledge-embeddings.generated.json";

/**
 * Retrieval-augmented knowledge lookup (P4 RAG 流①).
 *
 * Two paths, vector-first with a keyword safety net:
 *   1. Vector: if an embedding provider is configured AND the committed vectors
 *      in knowledge-embeddings.generated.json were built by the SAME provider
 *      (providerId + dim match), embed the query, cosine-rank the cards, keep
 *      those above RAG_MIN_SCORE, return the top-k.
 *   2. Keyword fallback: provider null / embed throws / no or mismatched
 *      vectors / no cards → score by keyword (1.0) / tag (0.5) / title (0.8)
 *      hits and return the top-k.
 *
 * FAIL-SAFE CONTRACT:
 *   - retrieveKnowledge NEVER throws and NEVER blocks the request beyond the
 *     embed timeout (any failure falls back to keyword scoring immediately).
 *   - Crisis / safety routing runs BEFORE retrieval in the chat route and does
 *     NOT depend on this module. RAG must never affect the deterministic safety
 *     floor. Returning [] is always acceptable (the prompt degrades to generic
 *     supportive mode).
 */

type GeneratedEmbeddings = {
  providerId: string;
  model: string;
  dim: number;
  vectors: Record<string, number[]>;
};

const GENERATED = generated as GeneratedEmbeddings;

/** Default cosine threshold; override with RAG_MIN_SCORE (0..1). */
const DEFAULT_MIN_SCORE = 0.3;

function getMinScore(): number {
  const raw = process.env.RAG_MIN_SCORE;
  if (!raw) return DEFAULT_MIN_SCORE;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : DEFAULT_MIN_SCORE;
}

// ---------------------------------------------------------------------------
// Pure functions (unit-tested in knowledge.test.ts)
// ---------------------------------------------------------------------------

/** Cosine similarity. Returns 0 for length mismatch or a zero vector. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Min-max normalize scores into 0..1. All-equal (or single) → all 1. */
export function normalize(scores: number[]): number[] {
  if (scores.length === 0) return [];
  let min = scores[0];
  let max = scores[0];
  for (const s of scores) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  if (max === min) return scores.map(() => 1);
  return scores.map((s) => (s - min) / (max - min));
}

/**
 * Top-k by score, descending, stable for ties (original order preserved).
 * `limit <= 0` returns [].
 */
export function topK<T>(items: T[], scores: number[], limit: number): T[] {
  if (limit <= 0) return [];
  return items
    .map((item, i) => ({ item, score: scores[i] ?? 0, i }))
    .sort((x, y) => (y.score !== x.score ? y.score - x.score : x.i - y.i))
    .slice(0, limit)
    .map((x) => x.item);
}

/**
 * Keyword score for one card against a lowercased query.
 *   keyword hit → 1.0, title token hit → 0.8, tag hit → 0.5 (summed).
 * Substring match (handles CJK where there are no word boundaries).
 */
export function keywordScore(card: KnowledgeCard, queryLower: string): number {
  let score = 0;
  for (const kw of card.keywords) {
    const k = kw.trim().toLowerCase();
    if (k && queryLower.includes(k)) score += 1.0;
  }
  for (const tag of card.tags) {
    const t = tag.trim().toLowerCase();
    if (t && queryLower.includes(t)) score += 0.5;
  }
  const title = card.title.trim().toLowerCase();
  if (title && queryLower.includes(title)) score += 0.8;
  return score;
}

/**
 * Keyword retrieval: top-k cards by keywordScore, dropping zero-score cards.
 * Pure (cards injected) so it is directly unit-testable. Never throws.
 */
export function keywordRetrieve(
  query: string,
  limit: number,
  cards: KnowledgeCard[] = KNOWLEDGE_CARDS
): KnowledgeCard[] {
  if (limit <= 0 || cards.length === 0) return [];
  const q = query.toLowerCase();
  const scored = cards
    .map((card) => ({ card, score: keywordScore(card, q) }))
    .filter((s) => s.score > 0);
  if (scored.length === 0) return [];
  return topK(
    scored.map((s) => s.card),
    scored.map((s) => s.score),
    limit
  );
}

/**
 * Vector retrieval over precomputed card vectors. Pure-ish: provider, cards and
 * the vector map are injected so it can be tested without network or disk.
 * Throws only if `provider.embed` throws — the public retrieveKnowledge catches
 * that and falls back to keywords.
 */
export async function vectorRetrieve(
  query: string,
  limit: number,
  provider: EmbeddingProvider,
  cards: KnowledgeCard[],
  vectorsById: Record<string, number[]>,
  minScore: number
): Promise<KnowledgeCard[]> {
  if (limit <= 0 || cards.length === 0) return [];
  const usable = cards.filter((c) => Array.isArray(vectorsById[c.id]));
  if (usable.length === 0) return [];

  const [queryVec] = await provider.embed([query]);
  if (!queryVec || queryVec.length === 0) return [];

  const scored = usable
    .map((card) => ({ card, score: cosineSimilarity(queryVec, vectorsById[card.id]) }))
    .filter((s) => s.score >= minScore);
  if (scored.length === 0) return [];

  return topK(
    scored.map((s) => s.card),
    scored.map((s) => s.score),
    limit
  );
}

/**
 * Whether the committed vectors were produced by `provider` (so cosine against
 * the query embedding is meaningful). Guards against a stale generated.json or
 * a provider/model/dim switch — on mismatch we use keywords instead of garbage.
 */
function vectorsMatchProvider(
  provider: EmbeddingProvider,
  gen: GeneratedEmbeddings
): boolean {
  return (
    gen.providerId === provider.id &&
    gen.dim > 0 &&
    (provider.dim === 0 || provider.dim === gen.dim) &&
    Object.keys(gen.vectors).length > 0
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Retrieve up to `limit` knowledge cards relevant to `query`. Vector-first,
 * keyword fallback, never throws. See the FAIL-SAFE CONTRACT above.
 */
export async function retrieveKnowledge(query: string, limit = 4): Promise<KnowledgeCard[]> {
  try {
    const q = (query ?? "").trim();
    if (!q || limit <= 0 || KNOWLEDGE_CARDS.length === 0) {
      return keywordRetrieve(q, limit);
    }

    const provider = getEmbeddingProvider();
    if (provider && vectorsMatchProvider(provider, GENERATED)) {
      try {
        const hits = await vectorRetrieve(
          q,
          limit,
          provider,
          KNOWLEDGE_CARDS,
          GENERATED.vectors,
          getMinScore()
        );
        // A successful-but-empty vector pass is a legitimate "no card cleared
        // the threshold"; still offer the keyword net so a clear lexical match
        // isn't silently dropped.
        if (hits.length > 0) return hits;
      } catch {
        // embed failed / timed out → fall through to keywords.
      }
    }

    return keywordRetrieve(q, limit);
  } catch {
    // Absolute backstop: retrieval must never throw into the chat path.
    return [];
  }
}

// Re-export so the build script and tests can share the canonical embed text.
export { cardEmbedText };
