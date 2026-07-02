/**
 * Fail-safe Qdrant dense-retrieval client (P5 clinical RAG · Tier-1).
 *
 * The query text is embedded by the SAME cloud embedding provider used to build the
 * corpus (src/lib/embeddings.ts), then this module runs a dense nearest-neighbour
 * search against a Qdrant Cloud collection and maps the payloads back into
 * KnowledgeCard so the rest of the pipeline (rerank / prompt grounding / the
 * "信息来源" panel) is unchanged.
 *
 * SAFETY / FAIL-SAFE CONTRACT (mirrors embeddings.ts / web-search.ts / rerank.ts):
 *   - Missing env / non-2xx / timeout / any thrown error → returns `null`. NEVER throws.
 *     A `null` return is the documented signal for knowledge.ts to fall through to the
 *     committed-vector path and then keyword retrieval. RAG is an enhancement, never a
 *     dependency of the deterministic safety floor.
 *   - The `must` filter ALWAYS pins clinicalStatus == "approved": only clinician-approved
 *     content is ever retrievable, no matter what is stored in the collection.
 *   - Uses the built-in global `fetch` + AbortController timeout — no new npm deps.
 */

import type { KnowledgeCard } from "./types";

type QdrantMatch = { key: string; match: { value: string } };

type QdrantPoint = {
  id?: string | number;
  score?: number;
  payload?: Record<string, unknown> | null;
};

export type QdrantSearchOptions = {
  limit: number;
  lang?: "zh" | "en";
  trustTier?: "authoritative" | "research";
  /** Hard per-request timeout. Keeps a stale/slow endpoint from stalling the reply. */
  timeoutMs?: number;
  /** Cosine floor applied SERVER-SIDE. Fast mode only (no rerank there) — deep mode
   *  relies on the reranker for precision, so a floor would starve its recall set. */
  scoreThreshold?: number;
};

const DEFAULT_TIMEOUT_MS = 3500;

/**
 * True only when ALL Qdrant env vars are present. Callers use this to skip the (network)
 * query-embedding step entirely when the vector store isn't configured — so retrieval
 * stays fully inert (zero extra API calls) until the infra is stood up.
 */
export function isQdrantConfigured(): boolean {
  return Boolean(
    process.env.QDRANT_URL && process.env.QDRANT_API_KEY && process.env.QDRANT_COLLECTION
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Map a Qdrant payload back into a KnowledgeCard. Preserves the verifiable-source triple
 * (sourceTitle / sourceUrl / sourceQuote) so the "信息来源" panel is byte-identical to the
 * hand-written cards. clinicalStatus is forced to "approved" — the query filter guarantees
 * it, and nothing else may reach the model.
 */
function payloadToCard(point: QdrantPoint): KnowledgeCard | null {
  const p = point.payload;
  if (!p) return null;
  const id = optStr(p.id) ?? optStr(p.sourceId) ?? (point.id != null ? String(point.id) : "");
  if (!id) return null;
  return {
    id,
    title: str(p.title),
    tags: strArr(p.tags),
    keywords: strArr(p.keywords),
    content: str(p.content),
    guidance: strArr(p.guidance),
    sourceTitle: optStr(p.sourceTitle),
    sourceUrl: optStr(p.sourceUrl),
    sourceQuote: optStr(p.sourceQuote),
    lang: p.lang === "en" ? "en" : p.lang === "zh" ? "zh" : undefined,
    trustTier:
      p.trustTier === "research" ? "research" : p.trustTier === "authoritative" ? "authoritative" : undefined,
    sourceId: optStr(p.sourceId),
    chunkPath: optStr(p.chunkPath),
    // Read the REAL stored status (not hardcoded). qdrantDenseSearch then drops anything
    // that isn't "approved" — defence-in-depth so a weakened server filter can never leak
    // draft/pending content to the model.
    clinicalStatus:
      p.clinicalStatus === "approved"
        ? "approved"
        : p.clinicalStatus === "pending"
          ? "pending"
          : p.clinicalStatus === "draft"
            ? "draft"
            : undefined
  };
}

/**
 * Dense nearest-neighbour search over the approved clinical corpus. Returns the mapped
 * cards, or `null` when Qdrant is unavailable / unconfigured / errors (caller falls back).
 * An empty array is possible when the collection has no match; the caller treats null and
 * empty the same (fall through), so only a genuine hit short-circuits the pipeline.
 */
export async function qdrantDenseSearch(
  vector: number[],
  opts: QdrantSearchOptions
): Promise<KnowledgeCard[] | null> {
  try {
    const url = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;
    const collection = process.env.QDRANT_COLLECTION;
    if (!url || !apiKey || !collection) return null; // unconfigured → keyword/vector fallback
    if (!Array.isArray(vector) || vector.length === 0) return null;
    if (!opts || opts.limit <= 0) return null;

    // approved-only is NON-NEGOTIABLE and always first in the filter.
    const must: QdrantMatch[] = [{ key: "clinicalStatus", match: { value: "approved" } }];
    if (opts.lang) must.push({ key: "lang", match: { value: opts.lang } });
    if (opts.trustTier) must.push({ key: "trustTier", match: { value: opts.trustTier } });

    const baseUrl = url.replace(/\/$/, "");
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/collections/${collection}/points/query`, {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: vector,
          filter: { must },
          limit: opts.limit,
          with_payload: true,
          ...(typeof opts.scoreThreshold === "number" && opts.scoreThreshold > 0
            ? { score_threshold: opts.scoreThreshold }
            : {})
        }),
        signal: controller.signal
      });
      if (!response.ok) return null;
      const json = (await response.json()) as { result?: { points?: QdrantPoint[] } };
      const points = json.result?.points ?? [];
      return points
        .map((pt) => payloadToCard(pt))
        .filter((c): c is KnowledgeCard => c !== null)
        // Defence-in-depth: only approved content ever reaches the model, even if the
        // server-side `must` filter were ever weakened or a stray point slipped in.
        .filter((c) => c.clinicalStatus === "approved");
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Fail-safe: any error → null. Retrieval is never a hard dependency.
    return null;
  }
}
