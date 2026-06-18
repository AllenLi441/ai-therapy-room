#!/usr/bin/env node
/**
 * scripts/build-knowledge-embeddings.mjs  (P4 RAG 流①)
 *
 * Precomputes the embedding vectors for every clinical knowledge card and
 * writes them to src/lib/knowledge-embeddings.generated.json (committed). The
 * runtime (src/lib/knowledge.ts) reads that file instead of embedding cards on
 * the fly, so the only network call per request is embedding the *query*.
 *
 * Pipeline:
 *   KNOWLEDGE_CARDS  →  cardEmbedText(card)  →  provider.embed(batch)  →  JSON
 *
 * Idempotent / re-runnable: it always rewrites the file from scratch.
 *
 * TS-from-.mjs note: this repo has no tsx / esbuild / ts-node (the other
 * scripts/*.mjs only read JSON data files, never import TS). We rely on Node's
 * native TypeScript type-stripping (Node 22.6+ behind --experimental-strip-types,
 * unflagged on Node 23/24) to dynamically import the cards module. The imported
 * file (src/lib/knowledge-cards.ts) uses only `import type` + plain runtime
 * values, so type-stripping is sufficient — no type-checking or transpilation of
 * decorators/enums is required. If you are on an older Node that cannot strip
 * types, run:  node --experimental-strip-types scripts/build-knowledge-embeddings.mjs
 *
 * Usage:  npm run kb:embed
 * Env:    see .env.example (EMBEDDING_* + RAG_MIN_SCORE).
 */

import { writeFile } from "node:fs/promises";
import process from "node:process";

const cardsUrl = new URL("../src/lib/knowledge-cards.ts", import.meta.url);
const embeddingsUrl = new URL("../src/lib/embeddings.ts", import.meta.url);
const outUrl = new URL("../src/lib/knowledge-embeddings.generated.json", import.meta.url);

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
      "     node --experimental-strip-types scripts/build-knowledge-embeddings.mjs\n" +
      "   (or upgrade to Node 23+/24 where it is unflagged).\n" +
      `   Underlying error: ${err?.message ?? err}`
  );
  process.exit(1);
}

const cards = KNOWLEDGE_CARDS ?? [];
const provider = getEmbeddingProvider();

// With zero cards there is nothing to embed; still (re)write a valid empty
// manifest so the committed file is always well-formed and the runtime's
// providerId/dim match check has something to read. We do NOT require a
// provider in the empty case — 流② will add cards and re-run this.
if (cards.length === 0) {
  const manifest = { providerId: "", model: "", dim: 0, vectors: {} };
  await writeFile(outUrl, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("ℹ️  No knowledge cards yet (流② pending). Wrote empty manifest:");
  console.log(`   ${outUrl.pathname}`);
  process.exit(0);
}

if (!provider) {
  console.error(
    "❌ No embedding provider configured, but there are knowledge cards to embed.\n" +
      "   Set EMBEDDING_PROVIDER (cloud|local) and the matching EMBEDDING_* vars\n" +
      "   (see .env.example), then re-run `npm run kb:embed`."
  );
  process.exit(1);
}

console.log(`Embedding ${cards.length} card(s) via ${provider.id} …`);

const texts = cards.map((card) => cardEmbedText(card));

let vectors;
try {
  vectors = await provider.embed(texts);
} catch (err) {
  console.error(`❌ Embedding call failed: ${err?.message ?? err}`);
  process.exit(1);
}

if (!Array.isArray(vectors) || vectors.length !== cards.length) {
  console.error(
    `❌ Embedder returned ${vectors?.length ?? "?"} vectors for ${cards.length} cards.`
  );
  process.exit(1);
}

const dim = vectors[0]?.length ?? 0;
for (const v of vectors) {
  if (!Array.isArray(v) || v.length !== dim || dim === 0) {
    console.error("❌ Inconsistent or empty vector dimensions returned by the embedder.");
    process.exit(1);
  }
}

const byId = {};
cards.forEach((card, i) => {
  byId[card.id] = vectors[i];
});

const manifest = {
  providerId: provider.id,
  model: provider.id.split(":").slice(1).join(":") || provider.id,
  dim,
  vectors: byId
};

await writeFile(outUrl, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(
  `✅ Wrote ${cards.length} vector(s) (dim ${dim}, provider ${provider.id}) →\n   ${outUrl.pathname}`
);
