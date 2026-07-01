#!/usr/bin/env node
/**
 * scripts/ingest/upsert-cards.mjs  (P5 clinical RAG · Milestone 1)
 *
 * Embeds the clinician-APPROVED knowledge cards with the SAME cloud embedding provider
 * the runtime uses (src/lib/embeddings.ts) and upserts them into a Qdrant Cloud collection
 * as dense vectors + payload. This is the M1 "walking skeleton": only the 17 hand-written
 * approved cards, dense-only. The full fetch→clean→chunk→verify pipeline is M2 (see README).
 *
 * SAFETY:
 *   - ONLY clinicalStatus === "approved" cards are embedded/upserted. A non-approved card
 *     reaching this script is a hard error (never silently written).
 *   - Every point payload pins clinicalStatus:"approved" so the runtime filter is honoured.
 *   - No API keys are hard-coded. Keys come from process.env (set them in a gitignored
 *     .env.local via the shell, or export them for this one run — the assistant never
 *     touches your keys).
 *
 * Writes a diff-able audit snapshot to src/lib/knowledge-chunk-snapshot.generated.json
 * (payload metadata only, no vectors) so TS↔Qdrant drift is reviewable in git.
 *
 * TS-from-.mjs: relies on Node's native type-stripping (Node 22.6+ / unflagged on 23/24),
 * same as scripts/build-knowledge-embeddings.mjs. If your Node can't strip types, run:
 *   node --experimental-strip-types scripts/ingest/upsert-cards.mjs
 *
 * Usage:
 *   QDRANT_URL=... QDRANT_API_KEY=... QDRANT_COLLECTION=... \
 *   EMBEDDING_API_KEY=... node scripts/ingest/upsert-cards.mjs
 */

import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import process from "node:process";

const cardsUrl = new URL("../../src/lib/knowledge-cards.ts", import.meta.url);
const embeddingsUrl = new URL("../../src/lib/embeddings.ts", import.meta.url);
const snapshotUrl = new URL("../../src/lib/knowledge-chunk-snapshot.generated.json", import.meta.url);

let KNOWLEDGE_CARDS;
let cardEmbedText;
let getEmbeddingProvider;
try {
  ({ KNOWLEDGE_CARDS, cardEmbedText } = await import(cardsUrl.href));
  ({ getEmbeddingProvider } = await import(embeddingsUrl.href));
} catch (err) {
  console.error(
    "❌ Could not import the TypeScript card / embedding modules.\n" +
      "   This script needs Node's TypeScript type-stripping. Try:\n" +
      "     node --experimental-strip-types scripts/ingest/upsert-cards.mjs\n" +
      `   Underlying error: ${err?.message ?? err}`
  );
  process.exit(1);
}

// --- env (read-only; never printed) -----------------------------------------
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION;
if (!QDRANT_URL || !QDRANT_API_KEY || !QDRANT_COLLECTION) {
  console.error(
    "❌ Missing QDRANT_URL / QDRANT_API_KEY / QDRANT_COLLECTION.\n" +
      "   Set them for this run (see docs/rag-m1-runbook.md), then re-run."
  );
  process.exit(1);
}
const baseUrl = QDRANT_URL.replace(/\/$/, "");
const qdrantHeaders = { "api-key": QDRANT_API_KEY, "Content-Type": "application/json" };

// --- approved-only gate ------------------------------------------------------
const allCards = KNOWLEDGE_CARDS ?? [];
const approved = allCards.filter((c) => c.clinicalStatus === "approved");
if (approved.length === 0) {
  console.error("❌ No approved cards to upsert. Nothing written.");
  process.exit(1);
}
console.log(`Found ${approved.length}/${allCards.length} approved card(s).`);

// --- embed (same provider as the runtime) ------------------------------------
const provider = getEmbeddingProvider();
if (!provider) {
  console.error(
    "❌ No embedding provider configured. Set EMBEDDING_* (see .env.example),\n" +
      "   then re-run. Query-time retrieval must use the SAME provider/model."
  );
  process.exit(1);
}

console.log(`Embedding ${approved.length} card(s) via ${provider.id} …`);
const texts = approved.map((card) => cardEmbedText(card));
let vectors;
try {
  vectors = await provider.embed(texts);
} catch (err) {
  console.error(`❌ Embedding call failed: ${err?.message ?? err}`);
  process.exit(1);
}
const dim = vectors[0]?.length ?? 0;
if (!Array.isArray(vectors) || vectors.length !== approved.length || dim === 0) {
  console.error("❌ Embedder returned an unexpected number/shape of vectors.");
  process.exit(1);
}
for (const v of vectors) {
  if (!Array.isArray(v) || v.length !== dim) {
    console.error("❌ Inconsistent vector dimensions returned by the embedder.");
    process.exit(1);
  }
}

// --- ensure collection (dense, Cosine, size = model dim) ---------------------
async function ensureCollection() {
  const getRes = await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}`, {
    method: "GET",
    headers: qdrantHeaders
  });
  if (getRes.ok) {
    console.log(`Collection "${QDRANT_COLLECTION}" already exists.`);
    return;
  }
  const putRes = await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}`, {
    method: "PUT",
    headers: qdrantHeaders,
    body: JSON.stringify({ vectors: { size: dim, distance: "Cosine" } })
  });
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => "");
    console.error(`❌ Failed to create collection (${putRes.status}): ${body.slice(0, 240)}`);
    process.exit(1);
  }
  console.log(`Created collection "${QDRANT_COLLECTION}" (size ${dim}, Cosine).`);
}

// Deterministic UUID from the card id (Qdrant point ids must be uint or UUID; our card
// ids are slugs). Same slug → same point id → idempotent re-runs.
function pointIdFor(cardId) {
  const h = createHash("md5").update(cardId).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const points = approved.map((card, i) => ({
  id: pointIdFor(card.id),
  vector: vectors[i],
  payload: {
    ...card,
    lang: card.lang ?? "zh",
    trustTier: card.trustTier ?? "authoritative",
    sourceId: card.sourceId ?? card.id,
    chunkPath: card.chunkPath ?? card.title,
    clinicalStatus: "approved"
  }
}));

await ensureCollection();

const upsertRes = await fetch(`${baseUrl}/collections/${QDRANT_COLLECTION}/points?wait=true`, {
  method: "PUT",
  headers: qdrantHeaders,
  body: JSON.stringify({ points })
});
if (!upsertRes.ok) {
  const body = await upsertRes.text().catch(() => "");
  console.error(`❌ Upsert failed (${upsertRes.status}): ${body.slice(0, 240)}`);
  process.exit(1);
}
console.log(`✅ Upserted ${points.length} point(s) into "${QDRANT_COLLECTION}".`);

// --- diff-able audit snapshot (metadata only, no vectors) --------------------
const snapshot = {
  providerId: provider.id,
  model: provider.id.split(":").slice(1).join(":") || provider.id,
  dim,
  collection: QDRANT_COLLECTION,
  count: points.length,
  cards: points
    .map((pt) => ({
      id: pt.payload.id,
      pointId: pt.id,
      title: pt.payload.title,
      lang: pt.payload.lang,
      trustTier: pt.payload.trustTier,
      clinicalStatus: pt.payload.clinicalStatus,
      sourceTitle: pt.payload.sourceTitle ?? null,
      sourceUrl: pt.payload.sourceUrl ?? null,
      hasQuote: Boolean(pt.payload.sourceQuote),
      chunkPath: pt.payload.chunkPath
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
};
await writeFile(snapshotUrl, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
console.log(`✅ Wrote audit snapshot → ${snapshotUrl.pathname}`);
console.log("   Commit it so TS↔Qdrant drift is reviewable. Changed a card? Re-run this.");
