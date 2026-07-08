/**
 * Pluggable embedding abstraction (P4 RAG 流① — pure engineering).
 *
 * Two backends behind one interface:
 *   - "cloud": OpenAI-compatible /embeddings endpoint (query text leaves the
 *     server and is sent to the embedding provider).
 *   - "local": a future on-prem sidecar (e.g. Python BGE-m3) — user text stays
 *     on your own infrastructure.
 *
 * Selection is env-driven (see getEmbeddingProvider). Construction is fail-safe:
 * a missing key / unconfigured backend / any setup error returns `null`, which
 * the retrieval layer (src/lib/knowledge.ts) treats as a signal to fall back to
 * keyword retrieval. RAG is an enhancement; it must never become a dependency
 * of the deterministic safety path.
 *
 * The fetch-with-timeout pattern is modelled on src/lib/kimi.ts (AbortController
 * + timeoutMs). No new npm deps — uses the built-in global `fetch`.
 */

export interface EmbeddingProvider {
  readonly id: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

const DEFAULT_CLOUD_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CLOUD_MODEL = "text-embedding-3-small";

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

/**
 * Cloud (OpenAI-compatible) embedding backend.
 * POST {baseUrl}/embeddings  body { model, input, dimensions? }
 * header Authorization: Bearer {apiKey}
 */
class CloudEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dim: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: {
    apiKey: string;
    baseUrl: string;
    model: string;
    dim: number;
    timeoutMs?: number;
  }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.model = opts.model;
    this.dim = opts.dim;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.id = `openai:${this.model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { controller, clear } = withTimeout(this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          // Only send `dimensions` when it is a positive number; some
          // OpenAI-compatible servers reject the field otherwise.
          ...(this.dim > 0 ? { dimensions: this.dim } : {})
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Embedding API error ${response.status}: ${text.slice(0, 240)}`);
      }

      const json = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      const vectors = (json.data ?? []).map((d) => d.embedding ?? []);
      if (vectors.length !== texts.length) {
        throw new Error(
          `Embedding API returned ${vectors.length} vectors for ${texts.length} inputs`
        );
      }
      return vectors;
    } finally {
      clear();
    }
  }
}

/**
 * Local on-prem backend (future Python BGE-m3 sidecar).
 * POST {baseUrl}  body { input: string[] }  →  { embeddings: number[][] }
 * User text never leaves the server.
 */
class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dim: number;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl: string; model: string; dim: number; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.model = opts.model;
    this.dim = opts.dim;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.id = `local:${this.model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { controller, clear } = withTimeout(this.timeoutMs);
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: texts }),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Local embedding error ${response.status}: ${text.slice(0, 240)}`);
      }

      const json = (await response.json()) as { embeddings?: number[][] };
      const vectors = json.embeddings ?? [];
      if (vectors.length !== texts.length) {
        throw new Error(
          `Local embedder returned ${vectors.length} vectors for ${texts.length} inputs`
        );
      }
      return vectors;
    } finally {
      clear();
    }
  }
}

/**
 * Build the configured embedding provider, or return `null` when it can't be
 * constructed (missing key, unconfigured backend, bad config). A `null` return
 * is the documented signal for knowledge.ts to use the keyword fallback — it is
 * NOT an error condition.
 *
 * Env:
 *   EMBEDDING_PROVIDER  cloud | local   (default: cloud)
 *   EMBEDDING_BASE_URL  endpoint base (cloud default https://api.openai.com/v1)
 *   EMBEDDING_API_KEY   bearer key (cloud only; required for cloud)
 *   EMBEDDING_MODEL     model id (cloud default text-embedding-3-small)
 *   EMBEDDING_DIM       requested output dimension (0 / unset = provider default)
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  try {
    const backend = (process.env.EMBEDDING_PROVIDER || "cloud").trim().toLowerCase();
    const dimRaw = process.env.EMBEDDING_DIM;
    const dim = dimRaw ? Number.parseInt(dimRaw, 10) : 0;
    const safeDim = Number.isFinite(dim) && dim > 0 ? dim : 0;

    if (backend === "local") {
      const baseUrl = process.env.EMBEDDING_BASE_URL;
      if (!baseUrl) return null; // local sidecar URL is required
      const model = process.env.EMBEDDING_MODEL || "bge-m3";
      return new LocalEmbeddingProvider({ baseUrl, model, dim: safeDim });
    }

    if (backend === "cloud") {
      const apiKey = process.env.EMBEDDING_API_KEY;
      if (!apiKey) return null; // no key → fall back to keyword retrieval
      const baseUrl = process.env.EMBEDDING_BASE_URL || DEFAULT_CLOUD_BASE_URL;
      const model = process.env.EMBEDDING_MODEL || DEFAULT_CLOUD_MODEL;
      return new CloudEmbeddingProvider({ apiKey, baseUrl, model, dim: safeDim });
    }

    // Unknown backend value → unconfigured.
    return null;
  } catch {
    // Any construction failure is fail-safe: behave as "no provider".
    return null;
  }
}
