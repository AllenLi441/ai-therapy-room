import type { KnowledgeCard } from "./types";
import type { EmbeddingProvider } from "./embeddings";
import { getEmbeddingProvider } from "./embeddings";
import { KNOWLEDGE_CARDS, cardEmbedText } from "./knowledge-cards";
import { rerankByRelevance, getRerankMinScore } from "./rerank";
import { qdrantDenseSearch, isQdrantConfigured } from "./qdrant";
import generated from "./knowledge-embeddings.generated.json";

// Reranking pipeline (the "检索完先整理" step): pull a wider VECTOR recall set above a
// lenient cosine floor, then let the cross-encoder reranker judge true relevance and keep
// only the cards that clear getRerankMinScore(). Cosine baselines run high in-domain, so
// recall stays broad and precision is the reranker's job.
const RECALL_N = 8;
const RECALL_FLOOR = 0.3;

// Tier-1 (Qdrant dense) hard wall-clock budgets. Tier-1 = embed(API) + Qdrant, two
// cross-border round-trips. Fast mode (reply target ≤6s) caps the WHOLE tier at ~2.5s
// and skips rerank; on timeout we fall straight through to keyword so the reply is never
// stalled by a slow/stale endpoint (the embed provider's own 15s timeout is not enough).
// Deep mode may relax.
const TIER1_FAST_TIMEOUT_MS = 2500;
const TIER1_DEEP_TIMEOUT_MS = 8000;

// Fast-mode cosine floor over the Qdrant corpus. Default calibrated against the real
// ingested corpus (on-topic queries score ≥ ~0.55, off-topic ≤ ~0.4 on Qwen3-Embedding);
// RAG_FAST_SCORE_FLOOR overrides without a deploy.
const FAST_SCORE_FLOOR_DEFAULT = 0.45;
function fastScoreFloor(): number {
  const raw = Number.parseFloat(process.env.RAG_FAST_SCORE_FLOOR ?? "");
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : FAST_SCORE_FLOOR_DEFAULT;
}

// Intent gate: only ground a reply in the KB when the user is actually ASKING for
// information / methods — not merely venting about a topic. A relevant card retrieved for
// "睡不着好烦" (venting) produces a warm empathy reply that doesn't use the card, so the
// shown sources look bolted-on and the whole chat tips clinical. Venting → no retrieval →
// pure companionship (like before RAG). Errs toward NOT retrieving (warmth first); the
// reranker is the second filter for whatever does get retrieved. Boundary replies
// (medication/diagnosis) are routed by safety.ts, NOT here, so they are unaffected.
const INFO_MARKERS = [
  "?", "？",
  "怎么办", "怎么治", "怎么调", "怎么缓解", "怎么改善", "怎么应对", "怎么克服", "怎么处理", "怎么调理",
  "如何缓解", "如何改善", "如何应对", "如何处理", "如何调整",
  "有什么办法", "有什么方法", "有什么建议", "有没有办法", "有没有什么", "什么方法可以",
  "为什么会", "有用吗", "管用吗", "有效吗", "能不能", "可不可以", "该怎么", "该不该",
  "求助", "求推荐", "教我", "教教我", "想了解", "想知道", "介绍一下", "科普",
  "是不是抑郁", "是不是焦虑", "是不是得了", "算不算", "正常吗", "正常么", "靠谱吗", "怎么回事",
  "科学的方法", "科学方法", "循证"
];
const INFO_SEEKING_EN = /\b(how (do|to|can)|what (is|are|causes)|why does|should i|can i|is it normal|any (tips|advice)|what should)\b|\?/i;

/** Whether the user is asking for information/methods (→ ground in the KB) vs just venting. */
export function isInfoSeeking(text: string): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  return INFO_MARKERS.some((m) => t.includes(m)) || INFO_SEEKING_EN.test(t);
}

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

/** Default cosine threshold; override with RAG_MIN_SCORE (0..1).
 *  0.50 (was 0.30): with Qwen3/bge vectors, same-domain cosine baselines run high
 *  (~0.35–0.45 even for OFF-topic cards), so a 0.30 floor pulled clinical cards into
 *  casual venting → replies drifted into a textbook/科普 tone (2026-06-27 owner report).
 *  Measured separation: genuinely-relevant cards land 0.55–0.69, noise 0.35–0.47, so
 *  0.50 keeps real topical matches and leaves a pure-empathy reply card-free. (Keyword
 *  path keeps its own KEYWORD_MIN_SCORE below — this only affects the vector path.) */
const DEFAULT_MIN_SCORE = 0.5;

// Keyword path: minimum keywordScore for a card to enter the model's context.
// An exact keyword (≥1.0) or tag (0.5) match always clears it; bigram-only recall
// needs ~4 shared bigrams. Keeps barely-related cards out on long, multi-field
// queries (concern + message + case map) where many cards pick up a few bigrams.
const KEYWORD_MIN_SCORE = 0.3;

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
/** Character bigrams of a string (whitespace-stripped, lowercased). */
function charBigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "").toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2));
  return out;
}

export function keywordScore(card: KnowledgeCard, queryLower: string): number {
  let score = 0;
  // Strong signal: exact substring matches, specificity-weighted — a longer matched
  // phrase ("考试焦虑") beats a short generic one ("焦虑"). 2-char stays 1.0, each
  // extra char +0.1 (capped +0.8). 1-char keywords are ignored as noise.
  for (const kw of card.keywords) {
    const k = kw.trim().toLowerCase();
    if (k.length >= 2 && queryLower.includes(k)) {
      score += 1.0 + Math.min(k.length - 2, 8) * 0.1;
    }
  }
  for (const tag of card.tags) {
    const t = tag.trim().toLowerCase();
    if (t && queryLower.includes(t)) score += 0.5;
  }
  const title = card.title.trim().toLowerCase();
  if (title && queryLower.includes(title)) score += 0.8;

  // Recall net: shared character bigrams between the query and the card's keywords +
  // title surface paraphrases that no keyword matches verbatim ("父母什么都要管" ↔ a
  // card keyworded "父母管太多"). Weak per-bigram so exact matches always dominate.
  const qb = charBigrams(queryLower);
  if (qb.size) {
    const counted = new Set<string>();
    for (const kw of [...card.keywords, card.title]) {
      for (const bg of charBigrams(kw)) {
        if (qb.has(bg)) counted.add(bg);
      }
    }
    // Need ≥3 shared bigrams before the recall net fires — 1–2 coincidental
    // overlaps (common in any Chinese sentence) are noise, not a topical match.
    score += Math.min(Math.max(0, counted.size - 2), 10) * 0.15;
  }
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
    .filter((s) => s.score >= KEYWORD_MIN_SCORE);
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
 * Professional sign-off gate: only cards flipped to "approved" are retrieved
 * (missing/"draft" = inert). Lets any card be gated out by flipping its status,
 * without deleting it.
 */
function approvedCards(): KnowledgeCard[] {
  return KNOWLEDGE_CARDS.filter((c) => c.clinicalStatus === "approved");
}

/**
 * Retrieve up to `limit` knowledge cards relevant to `query`. Vector-first,
 * keyword fallback, never throws. See the FAIL-SAFE CONTRACT above.
 */
/**
 * Rerank a vector-recall candidate set, keeping only the cards above getRerankMinScore().
 * Returns the kept cards, or null when reranking is unavailable (caller falls back to
 * cosine). An EMPTY array is meaningful: the reranker ran and judged NOTHING relevant —
 * exactly what should happen for a casual/off-topic message (so the shown sources never
 * drift from the reply). Sorted by reranker relevance.
 */
async function rerankCards(
  query: string,
  candidates: KnowledgeCard[],
  limit: number
): Promise<KnowledgeCard[] | null> {
  const scores = await rerankByRelevance(
    query,
    candidates.map((c) => ({ id: c.id, text: `${c.title}。${c.content}` }))
  );
  if (!scores) return null;
  const minScore = getRerankMinScore();
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return scores
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => byId.get(s.id))
    .filter((c): c is KnowledgeCard => Boolean(c));
}

/** Options for retrieveKnowledge. `fastMode` skips rerank and tightens the Tier-1
 *  wall-clock budget (the chat route passes it based on session pace). */
export type RetrieveOptions = { fastMode?: boolean; timeoutMs?: number };

/**
 * Race `p` against a hard deadline. Resolves to `null` on timeout OR rejection — never
 * throws, never hangs the reply. The underlying embed/Qdrant work is abandoned (its own
 * AbortController fires later); we don't await it.
 */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

/**
 * Tier-1: embed the query with the SAME cloud provider used to build the corpus, then run
 * a dense Qdrant search over the approved cards.
 *   - deep mode: broad recall (RECALL_N) → rerank to true relevance (reused rerank.ts).
 *   - fast mode: top-k straight from Qdrant, NO rerank (keeps the ≤6s budget).
 * Returns the cards to use, or `null` when Tier-1 is unavailable / found nothing (embed
 * provider unset, Qdrant unconfigured/empty/errored) so the caller falls through to the
 * committed-vector path and then keyword. When Qdrant DID return hits, we commit to the
 * (possibly reranked, possibly empty) Tier-1 answer rather than re-admitting keyword noise
 * — mirroring the committed-vector path's "trust the reranker" contract.
 */
async function tier1QdrantRetrieve(
  q: string,
  limit: number,
  fastMode: boolean
): Promise<KnowledgeCard[] | null> {
  // Skip BEFORE embedding when Qdrant isn't configured: no wasted embed API call, and
  // retrieval stays fully inert until the vector store is stood up (the merge-safety
  // property the runbook relies on). Also avoids double-embedding on the fall-through.
  if (!isQdrantConfigured()) return null;

  const provider = getEmbeddingProvider();
  if (!provider) return null;

  const [queryVec] = await provider.embed([q]);
  if (!queryVec || queryVec.length === 0) return null;

  const recall = fastMode ? limit : RECALL_N;
  // Fast mode has NO rerank, so weak cosine hits would attach irrelevant sources on the
  // most-trafficked path — apply a server-side floor there (calibrated on the real corpus,
  // see scripts/ingest/calibrate-floor.mjs; env-tunable). Deep mode keeps the broad recall
  // set and lets the reranker judge precision (floor would starve it).
  const candidates = await qdrantDenseSearch(queryVec, {
    limit: recall,
    ...(fastMode ? { scoreThreshold: fastScoreFloor() } : {})
  });
  if (!candidates || candidates.length === 0) return null;

  if (fastMode) return candidates.slice(0, limit);

  const reranked = await rerankCards(q, candidates, limit);
  if (reranked !== null) return reranked;
  return candidates.slice(0, limit);
}

export async function retrieveKnowledge(
  query: string,
  limit = 4,
  opts: RetrieveOptions = {}
): Promise<KnowledgeCard[]> {
  try {
    const q = (query ?? "").trim();
    const cards = approvedCards();
    if (!q || limit <= 0 || cards.length === 0) {
      return keywordRetrieve(q, limit, cards);
    }

    // Tier-1: Qdrant dense retrieval, ABOVE the committed-vector path. Hard-timeout
    // bounded so a slow/stale endpoint can never stall the reply (fix: defence not
    // env-assumption). A hit short-circuits; null/empty falls through unchanged.
    const fastMode = opts.fastMode ?? false;
    const tier1Budget = opts.timeoutMs ?? (fastMode ? TIER1_FAST_TIMEOUT_MS : TIER1_DEEP_TIMEOUT_MS);
    const tier1 = await withDeadline(tier1QdrantRetrieve(q, limit, fastMode), tier1Budget);
    if (tier1 !== null) return tier1;

    // Fast mode (≤6s reply budget): do NOT run the committed-vector fallback — its embed
    // uses the provider's own long timeout and it reranks (network), which could stack on
    // top of the Tier-1 budget and blow the fast budget. Go straight to keyword. Deep mode
    // keeps the full waterfall below.
    if (fastMode) return keywordRetrieve(q, limit, cards);

    const provider = getEmbeddingProvider();
    if (provider && vectorsMatchProvider(provider, GENERATED)) {
      try {
        // 1) Broad vector recall (lenient cosine floor — recall, not precision).
        const candidates = await vectorRetrieve(q, RECALL_N, provider, cards, GENERATED.vectors, RECALL_FLOOR);
        if (candidates.length > 0) {
          // 2) Rerank to TRUE relevance. If it ran (non-null), trust it — even an empty
          //    result means "nothing is actually relevant" (don't re-admit cosine noise).
          const reranked = await rerankCards(q, candidates, limit);
          if (reranked !== null) return reranked;
          // 3) Reranker unavailable → cosine top-k at the stricter cosine threshold.
          const cosineHits = await vectorRetrieve(q, limit, provider, cards, GENERATED.vectors, getMinScore());
          if (cosineHits.length > 0) return cosineHits;
        }
      } catch {
        // embed / rerank failed or timed out → fall through to keywords.
      }
    }

    return keywordRetrieve(q, limit, cards);
  } catch {
    // Absolute backstop: retrieval must never throw into the chat path.
    return [];
  }
}

// Re-export so the build script and tests can share the canonical embed text.
export { cardEmbedText };
