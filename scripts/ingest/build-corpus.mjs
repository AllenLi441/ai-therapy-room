#!/usr/bin/env node
/**
 * scripts/ingest/build-corpus.mjs — M2 corpus ingestion orchestrator (slice 1).
 *
 * registry → fetch(robots+rate+cache) → clean → chunk(+criteria-exclude) →
 * verbatim-quote verify-or-drop → tier gate → embed(batched) → Qdrant upsert →
 * per-source stale prune → metadata snapshot.
 *
 * SAFETY:
 *   - Tier gate: authoritative → 'approved'; safetySensitive (suicide/self-harm) or
 *     research → 'pending' (runtime NEVER retrieves pending; approved-only filter +
 *     defence-in-depth in src/lib/qdrant.ts).
 *   - Quotes: verified against an independent minimal tag-strip of the fetched bytes;
 *     unverifiable → quote dropped, URL kept. Never fabricated.
 *   - Diagnostic-criteria checklists excluded at chunk stage (spec §2 non-goal).
 *   - Snapshot commits METADATA ONLY (no passages, no quote text) — licensing-conservative.
 *
 * Usage:
 *   DRY_RUN=1 node --env-file=.env.local scripts/ingest/build-corpus.mjs   # inspect only
 *   node --env-file=.env.local scripts/ingest/build-corpus.mjs             # full ingest
 */
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { enabledSources } from "./sources.mjs";
import { fetchPage } from "./fetch-page.mjs";
import { cleanHtml } from "./clean.mjs";
import { chunkBlocks } from "./chunk.mjs";
import { selectAndVerifyQuote } from "./verify-quote.mjs";
import { uuidFromKey, minimalTextFromHtml, batchEmbed } from "./util.mjs";

const embeddingsUrl = new URL("../../src/lib/embeddings.ts", import.meta.url);
const snapshotUrl = new URL("../../src/lib/corpus-chunk-snapshot.generated.json", import.meta.url);

const DRY = process.env.DRY_RUN === "1";
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION;
if (!DRY && (!QDRANT_URL || !QDRANT_API_KEY || !QDRANT_COLLECTION)) {
  console.error("❌ Missing QDRANT_URL / QDRANT_API_KEY / QDRANT_COLLECTION (or run with DRY_RUN=1).");
  process.exit(1);
}
const baseUrl = (QDRANT_URL ?? "").replace(/\/$/, "");
const qHeaders = { "api-key": QDRANT_API_KEY ?? "", "Content-Type": "application/json" };

// ---------- stage 1-4: fetch → clean → chunk → verify ----------
const perSource = [];
let allPoints = [];

for (const src of enabledSources()) {
  console.log(`\n▶ ${src.sourceId}  ${src.url}`);
  const page = await fetchPage({ url: src.url, expectedHost: src.expectedHost });
  if (!page) { perSource.push({ ...srcMeta(src), status: "fetch_failed", chunks: 0 }); continue; }

  const pageText = minimalTextFromHtml(page.rawHtml);
  const blocks = cleanHtml(page.rawHtml);
  const { chunks, excludedCriteria } = chunkBlocks(blocks, { lang: src.lang });
  if (chunks.length === 0) { perSource.push({ ...srcMeta(src), status: "no_chunks", chunks: 0 }); continue; }

  const clinicalStatus = src.safetySensitive ? "pending" : (src.trustTier === "authoritative" ? "approved" : "pending");
  let verified = 0, dropped = 0, noCand = 0;

  const points = chunks.map((c) => {
    const q = selectAndVerifyQuote(c.passage, pageText, src.lang);
    if (q.quoteStatus === "verified") verified += 1;
    else if (q.quoteStatus === "dropped_unverified") dropped += 1;
    else noCand += 1;
    const key = `${src.sourceId}::${c.chunkPath}::${c.ordinal}`;
    return {
      id: uuidFromKey(key),
      embedText: `${c.title || src.topic}\n${c.passage}`,
      payload: {
        id: key,
        title: c.title || src.topic,
        tags: [src.topic],
        keywords: [],
        content: c.passage,
        guidance: [],
        sourceTitle: src.org,
        sourceUrl: page.finalUrl,
        ...(q.sourceQuote ? { sourceQuote: q.sourceQuote } : {}),
        lang: src.lang,
        trustTier: src.trustTier,
        sourceId: src.sourceId,
        chunkPath: c.chunkPath,
        clinicalStatus
      }
    };
  });

  allPoints.push(...points);
  perSource.push({
    ...srcMeta(src), status: clinicalStatus, chunks: points.length,
    quotesVerified: verified, quotesDropped: dropped, quotesNoCandidate: noCand,
    excludedCriteria, fromCache: page.fromCache === true
  });
  console.log(`  ✓ ${points.length} chunk(s) · quotes ${verified}✓/${dropped}✗/${noCand}– · criteria-excluded ${excludedCriteria} · → ${clinicalStatus}`);
}

if (allPoints.length === 0) { console.error("❌ No chunks from any source. Nothing written."); process.exit(1); }

// ---------- dry run: human inspection gate ----------
if (DRY) {
  console.log(`\n=== DRY RUN — ${allPoints.length} chunks total, nothing written ===`);
  const sample = [...allPoints].sort(() => 0.5 - Math.random()).slice(0, 12);
  for (const p of sample) {
    console.log(`\n[${p.payload.clinicalStatus}] ${p.payload.sourceId} › ${p.payload.chunkPath}`);
    console.log(`  ${p.payload.content.slice(0, 110)}…`);
    console.log(`  quote: ${p.payload.sourceQuote ? `"${p.payload.sourceQuote.slice(0, 80)}…"` : "(dropped/none — URL only)"}`);
  }
  process.exit(0);
}

// ---------- stage 5: embed ----------
const { getEmbeddingProvider } = await import(embeddingsUrl.href);
const provider = getEmbeddingProvider();
if (!provider) { console.error("❌ No embedding provider (set EMBEDDING_*)."); process.exit(1); }
console.log(`\nEmbedding ${allPoints.length} chunk(s) via ${provider.id} …`);
const vectors = await batchEmbed(provider, allPoints.map((p) => p.embedText));
const dim = vectors[0]?.length ?? 0;
if (dim !== 1024) { console.error(`❌ dim ${dim} ≠ 1024 (must match the M1 corpus/query model).`); process.exit(1); }

// ---------- stage 6: ensure collection + upsert ----------
async function ensureCollection() {
  const get = await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}`, { headers: qHeaders });
  if (!get.ok) {
    const put = await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}`, {
      method: "PUT", headers: qHeaders,
      body: JSON.stringify({ vectors: { size: dim, distance: "Cosine" } })
    });
    if (!put.ok) { console.error(`❌ create collection: ${put.status}`); process.exit(1); }
  }
  for (const field of ["clinicalStatus", "lang", "trustTier", "sourceId"]) {
    const idx = await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}/index?wait=true`, {
      method: "PUT", headers: qHeaders,
      body: JSON.stringify({ field_name: field, field_schema: "keyword" })
    });
    if (!idx.ok && idx.status !== 409) {
      const t = await idx.text().catch(() => "");
      if (!/already exists/i.test(t)) { console.error(`❌ index ${field}: ${idx.status} ${t.slice(0, 120)}`); process.exit(1); }
    }
  }
}
await ensureCollection();

for (let i = 0; i < allPoints.length; i += 64) {
  const batch = allPoints.slice(i, i + 64).map((p, j) => ({ id: p.id, vector: vectors[i + j], payload: p.payload }));
  const res = await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}/points?wait=true`, {
    method: "PUT", headers: qHeaders, body: JSON.stringify({ points: batch })
  });
  if (!res.ok) { console.error(`❌ upsert batch ${i / 64}: ${res.status} ${(await res.text()).slice(0, 200)}`); process.exit(1); }
  process.stdout.write(`  upserted ${Math.min(i + 64, allPoints.length)}/${allPoints.length}\r`);
}
process.stdout.write("\n");

// ---------- stage 7: prune stale points per source (re-crawl hygiene) ----------
for (const src of enabledSources()) {
  const current = new Set(allPoints.filter((p) => p.payload.sourceId === src.sourceId).map((p) => p.id));
  if (current.size === 0) continue; // fetch failed this run → keep old points (fail-safe)
  const scroll = await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}/points/scroll`, {
    method: "POST", headers: qHeaders,
    body: JSON.stringify({ filter: { must: [{ key: "sourceId", match: { value: src.sourceId } }] }, limit: 2000, with_payload: false, with_vector: false })
  });
  if (!scroll.ok) continue;
  const existing = ((await scroll.json()).result?.points ?? []).map((p) => p.id);
  const stale = existing.filter((id) => !current.has(id));
  if (stale.length) {
    await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}/points/delete?wait=true`, {
      method: "POST", headers: qHeaders, body: JSON.stringify({ points: stale })
    });
    console.log(`  pruned ${stale.length} stale point(s) for ${src.sourceId}`);
  }
}

// ---------- stage 8: metadata snapshot (NO passages, NO quote text) ----------
const snapshot = {
  note: "Corpus audit snapshot — metadata only. Passages live ONLY in Qdrant (licensing-conservative). Re-run build-corpus.mjs to refresh; quote text is never committed.",
  providerId: provider.id, dim, collection: QDRANT_COLLECTION,
  totalChunks: allPoints.length,
  approved: allPoints.filter((p) => p.payload.clinicalStatus === "approved").length,
  pending: allPoints.filter((p) => p.payload.clinicalStatus === "pending").length,
  sources: perSource.sort((a, b) => a.sourceId.localeCompare(b.sourceId))
};
await writeFile(snapshotUrl, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
console.log(`\n✅ ${snapshot.approved} approved + ${snapshot.pending} pending chunk(s) in "${QDRANT_COLLECTION}"`);
console.log(`✅ snapshot → src/lib/corpus-chunk-snapshot.generated.json (commit it)`);

function srcMeta(src) {
  return { sourceId: src.sourceId, url: src.url, lang: src.lang, trustTier: src.trustTier, license: src.license, safetySensitive: src.safetySensitive === true };
}
