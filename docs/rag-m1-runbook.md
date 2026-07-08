# 静室 clinical RAG — Milestone 1 runbook (user steps)

M1 = walking skeleton: the 17 approved cards, embedded via the cloud API and stored in
Qdrant Cloud, retrieved at query time (Tier-1) and used to *ground* the reply. The code is
on branch `p5-clinical-rag`. Until Qdrant env is set the retrieval code is inert (fail-safe
→ keyword), but the prompt changes go live the moment `p5` merges — so **do not merge until
the eval + tone check below pass**.

The assistant writes code and runs mocked tests only. **You** do the infra steps (accounts
+ keys); the assistant never touches your keys or fills them into any web form.

## 1. Create a Qdrant Cloud free cluster
- Sign up at cloud.qdrant.io (free tier, no card), create a cluster.
- Copy the cluster **URL** (e.g. `https://xxxx.aws.cloud.qdrant.io:6333`) and create an
  **API key**.
- Pick a collection name, e.g. `jingshi-clinical`.

## 2. Fill Vercel env (values are yours; the assistant does not fill them)
Add to the Vercel project (Production + Preview):
- `QDRANT_URL` = your cluster URL
- `QDRANT_API_KEY` = your key
- `QDRANT_COLLECTION` = `jingshi-clinical`

## 3. Confirm the embedding key + endpoint (VERIFIED CONFIG)
- Provider: SiliconFlow. **`EMBEDDING_BASE_URL=https://api.siliconflow.com/v1`** — the
  `.com` (international) endpoint. NOTE: this account's key is rejected (401) by the `.cn`
  endpoint; it only works on `.com`. **Very likely the prod "no RAG" root cause**: if
  Vercel's `EMBEDDING_BASE_URL` is `.cn`, the live embed call 401s → silent keyword
  fallback. Set Vercel to `.com`.
- `EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B`, `EMBEDDING_DIM=1024`. Query and corpus
  vectors MUST come from the SAME model — keep ingest and Vercel identical.
- The key transited chat during setup → **rotate it** and update both `.env.local` and
  Vercel with the fresh key (same `.com` base, same model).
- `rerank.ts` also uses `EMBEDDING_BASE_URL`; the `.com` value serves it too.

## 4. Local `.env.local` (gitignored) for the one-time ingest
Put the same `QDRANT_*` + `EMBEDDING_*` values in a local `.env.local` (never committed),
or export them inline for the single run. Then:

```bash
node scripts/ingest/upsert-cards.mjs
```

It creates the collection (dense, Cosine, size = model dim), upserts the 17 approved cards,
and writes `src/lib/knowledge-chunk-snapshot.generated.json`.

## 5. Commit the snapshot
`git add src/lib/knowledge-chunk-snapshot.generated.json` and commit on `p5-clinical-rag`.
This is the diff-able record of what's in Qdrant.
**If you later edit a card's text, re-run step 4** or the TS source and Qdrant drift apart.

## 6. Before merging to main
- Run the jingshi-eval replay harness; confirm no regression (no科普腔 / no诊断腔).
- Manually spot-check tone: grounded facts should sound like 安屿, not a textbook; asking
  "这有依据吗" should get an honest "参考了可查证的资料", never "我瞎编的".
- Bump `APP_VERSION` (prompt behavior changes ship with a version bump).
- Merge `p5-clinical-rag` → main (Vercel auto-deploys).

## 7. Verify live (design spec §7.1)
- Ask an info question → reply is grounded in a real card; "信息来源" panel shows the real
  URL + verbatim quote.
- Pure venting → no sources, warm companionship (unchanged).
- Crisis turn → NO retrieval, NO web search, safety wording unchanged.
