/**
 * scripts/ingest/util.mjs — shared stdlib helpers for the ingest pipeline. No deps.
 */
import { createHash } from "node:crypto";

/** Deterministic UUID from a logical key (same md5→UUID shape as upsert-cards.mjs, but
 *  keyed `${sourceId}::${chunkPath}::${ordinal}` — the '::' namespace can never collide
 *  with the hand cards' bare-slug keys). Same key → same point id → idempotent re-runs. */
export function uuidFromKey(key) {
  const h = createHash("md5").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Normalization used ONLY for matching (quote verification): NFKC, strip zero-width,
 *  collapse all whitespace runs to a single space. Case-preserving — quotes must be
 *  verbatim, we only forgive whitespace/encoding presentation differences. */
export function normalizeForMatch(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** md5 of the normalized passage — dedupe + drift detection. */
export function contentHash(s) {
  return createHash("md5").update(normalizeForMatch(s)).digest("hex");
}

/**
 * MINIMAL text extraction from raw HTML — deliberately INDEPENDENT of clean.mjs's block
 * logic so quote verification is a real check, not a tautology: drop non-content
 * containers wholesale, then strip tags in place (no reordering, no reflow), decode
 * entities. If clean/chunk mangled a sentence, it will NOT be a substring of this text
 * and the quote gets dropped (verify-or-drop contract, knowledge-cards.ts:3-9).
 */
export function minimalTextFromHtml(rawHtml) {
  let s = String(rawHtml ?? "");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return normalizeForMatch(s);
}

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  hellip: "…", mdash: "—", ndash: "–", middot: "·", copy: "©"
};

export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCode(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}
function safeFromCode(code) {
  try { return Number.isFinite(code) ? String.fromCodePoint(code) : " "; } catch { return " "; }
}

/** Embed texts in small batches (SiliconFlow request-size limits) with basic 429 backoff.
 *  Preserves order; asserts the final count. */
export async function batchEmbed(provider, texts, size = 16) {
  const out = [];
  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size);
    let attempt = 0;
    for (;;) {
      try {
        const vecs = await provider.embed(batch);
        if (!Array.isArray(vecs) || vecs.length !== batch.length) {
          throw new Error(`embedder returned ${vecs?.length} vectors for ${batch.length} inputs`);
        }
        out.push(...vecs);
        break;
      } catch (err) {
        attempt += 1;
        if (attempt > 3) throw err;
        const wait = attempt * 2000;
        console.warn(`  embed batch ${i / size + 1} failed (${err?.message ?? err}) — retry in ${wait}ms`);
        await sleep(wait);
      }
    }
    process.stdout.write(`  embedded ${Math.min(i + size, texts.length)}/${texts.length}\r`);
  }
  process.stdout.write("\n");
  return out;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
