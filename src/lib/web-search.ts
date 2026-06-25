/**
 * Live web-search fallback for the RAG — used ONLY when the curated knowledge base has
 * no relevant card (i.e. the user asked about something the 17 cards don't cover).
 *
 * SAFETY (this is a mental-health product):
 *   - Restricted to an allowlist of AUTHORITATIVE health/research domains. An open-web
 *     search would surface unvetted, possibly harmful content (pro-suicide forums, quack
 *     advice) in front of vulnerable users — never acceptable here.
 *   - The chat route only calls this for NON-crisis turns, in DEEP mode, after the
 *     deterministic safety floor + danger judge have already cleared the message. It is
 *     an enhancement, never part of the safety path.
 *   - Fail-safe: no SEARCH_API_KEY → returns [] (KB-only, unchanged). Never throws,
 *     timeout-bounded. The results are SHOWN to the user (title + link + snippet) so the
 *     grounding stays checkable, consistent with the verifiable-RAG principle.
 *
 * Provider: Tavily by default (free 1,000 credits/month, no credit card, supports
 * `include_domains`). OpenAI-style env config; swap base URL for another provider that
 * speaks the same {query, include_domains, max_results} → {results:[{title,url,content}]}.
 */

export type WebResult = { title: string; url: string; snippet: string };

// Clearly-authoritative health / research orgs only. Mirrors the KB's source tiers.
export const AUTHORITATIVE_DOMAINS = [
  "who.int",
  "nih.gov",
  "nimh.nih.gov",
  "nccih.nih.gov",
  "ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "nhs.uk",
  "apa.org",
  "psychiatry.org",
  "cdc.gov",
  "cochranelibrary.com",
  "mayoclinic.org",
  "my.clevelandclinic.org"
];

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

/**
 * Search the authoritative allowlist for `query`. Returns up to `limit` results, or []
 * when unconfigured / on any failure. NEVER throws.
 */
export async function searchAuthoritative(query: string, limit = 3): Promise<WebResult[]> {
  try {
    const key = process.env.SEARCH_API_KEY;
    const q = (query ?? "").trim();
    if (!key || !q) return [];

    const baseUrl = (process.env.SEARCH_BASE_URL || "https://api.tavily.com").replace(/\/$/, "");
    const timeoutMs = Number.parseInt(process.env.SEARCH_TIMEOUT_MS || "", 10) || 6000;
    const { controller, clear } = withTimeout(timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: q.slice(0, 400),
          search_depth: "basic",
          max_results: Math.max(1, Math.min(limit, 5)),
          include_domains: AUTHORITATIVE_DOMAINS,
          include_answer: false,
          include_raw_content: false
        }),
        signal: controller.signal
      });
      if (!response.ok) return [];
      const json = (await response.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      return (json.results ?? [])
        .filter((r): r is { title: string; url: string; content?: string } => Boolean(r.url && r.title))
        .slice(0, limit)
        .map((r) => ({
          title: r.title.slice(0, 160),
          url: r.url,
          snippet: (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 300)
        }));
    } finally {
      clear();
    }
  } catch {
    // Fail-safe: any error → no web results, KB-only. RAG is never a hard dependency.
    return [];
  }
}
