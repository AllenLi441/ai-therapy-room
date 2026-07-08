/**
 * Cross-encoder RERANK — the "检索完先整理" step. Vector cosine has a high same-domain
 * baseline (a relationship-conflict message scores ~0.36 against EVERY card — "vaguely
 * like all, truly like none"), so a cosine floor alone lets similar-but-irrelevant cards
 * into the reply, and the shown sources stop matching what the model says. A reranker
 * re-judges each candidate's ACTUAL relevance to the query: irrelevant cards score ~0.00,
 * an on-topic card ~0.99. We keep only those above RERANK_MIN_SCORE.
 *
 * Reuses the embedding provider's base URL + key (same SiliconFlow account); model
 * defaults to Qwen/Qwen3-Reranker-0.6B. Fail-safe: missing key / unconfigured / any error
 * / timeout → returns null, and the caller falls back to the cosine ordering. Never throws.
 */

export type RerankScore = { id: string; score: number };

/** Default minimum reranker relevance (0..1) for a card to be kept. Override RERANK_MIN_SCORE. */
const DEFAULT_RERANK_MIN_SCORE = 0.3;

export function getRerankMinScore(): number {
  const raw = process.env.RERANK_MIN_SCORE;
  if (!raw) return DEFAULT_RERANK_MIN_SCORE;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : DEFAULT_RERANK_MIN_SCORE;
}

/**
 * Score each {id, text} doc's relevance to `query`. Returns scores (NOT filtered/sorted —
 * the caller applies the threshold), or null when reranking is unavailable / fails.
 */
export async function rerankByRelevance(
  query: string,
  docs: { id: string; text: string }[]
): Promise<RerankScore[] | null> {
  try {
    const key = process.env.EMBEDDING_API_KEY;
    const model = process.env.RERANK_MODEL ?? "Qwen/Qwen3-Reranker-0.6B";
    const q = (query ?? "").trim();
    if (!key || !model || !q || docs.length === 0) return null;

    const baseUrl = (process.env.EMBEDDING_BASE_URL || "https://api.siliconflow.com/v1").replace(/\/$/, "");
    const timeoutMs = Number.parseInt(process.env.RERANK_TIMEOUT_MS || "", 10) || 3500;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/rerank`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          query: q,
          documents: docs.map((d) => d.text),
          top_n: docs.length,
          return_documents: false
        }),
        signal: controller.signal
      });
      if (!response.ok) return null;
      const json = (await response.json()) as {
        results?: Array<{ index: number; relevance_score: number }>;
      };
      const out = (json.results ?? [])
        .map((r) => ({ id: docs[r.index]?.id, score: r.relevance_score }))
        .filter((r): r is RerankScore => Boolean(r.id) && Number.isFinite(r.score));
      return out.length ? out : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
