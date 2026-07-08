# scripts/ingest — 静室 clinical RAG corpus pipeline

Offline scripts that build the vector corpus retrieved at query time. Nothing here runs on
Vercel; the runtime only *reads* Qdrant (see `src/lib/qdrant.ts`).

## Milestone 1 (now) — `upsert-cards.mjs`

Embeds the **17 clinician-approved** hand-written cards with the same cloud embedding
provider the runtime uses and upserts them into Qdrant Cloud (dense-only). This is the
walking skeleton: prove embed → Qdrant → retrieve → grounded reply end-to-end before
scaling the corpus.

```bash
QDRANT_URL=... QDRANT_API_KEY=... QDRANT_COLLECTION=... \
EMBEDDING_API_KEY=... node scripts/ingest/upsert-cards.mjs
```

- ONLY `clinicalStatus === "approved"` cards are written (hard-enforced).
- Every point payload pins `clinicalStatus:"approved"`, plus `lang` / `trustTier` /
  `sourceId` / `chunkPath` for filtering + provenance.
- Writes `src/lib/knowledge-chunk-snapshot.generated.json` — a diff-able audit of what is
  in Qdrant (payload metadata only, no vectors). **Commit it.**
- Idempotent: point ids are a deterministic UUID of the card id, so re-runs overwrite.
- **Changed a card's text? Re-run this** or Qdrant drifts from the TypeScript source.

Full step-by-step (create cluster, fill env, verify): `docs/rag-m1-runbook.md`.

## Milestone 2 (later) — full bilingual corpus pipeline

Not built yet. When it lands it will be a staged, auditable pipeline (design spec §4.2):

1. **fetch** — pull from a registered source list (WHO 中英 / NIMH / NHS / CDC / 国家卫健委
   …), respecting robots.txt + rate limits.
2. **clean** — strip nav/boilerplate.
3. **chunk** — split by section, keeping the heading path (`chunkPath`).
4. **provenance** — attach `sourceUrl` + verbatim `sourceQuote` + `lang`.
5. **verbatim verification** — exact-phrase, domain-restricted re-check that the quote is
   really on the live page; on failure keep the URL, DROP the quote — never fabricate one
   (the `knowledge-cards.ts` header-3–9 contract).
6. **embed** — same cloud provider/model as M1.
7. **trust tiering** — `authoritative` → `clinicalStatus:"approved"`; `research` (PMC OA /
   Cochrane abstracts) → `clinicalStatus:"pending"` (review queue, never retrieved).
8. **upsert** — into Qdrant + refresh the audit snapshot.

M1 runs step 8 only, over the already-verified 17 cards.
