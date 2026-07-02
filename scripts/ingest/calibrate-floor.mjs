#!/usr/bin/env node
/**
 * scripts/ingest/calibrate-floor.mjs — empirical calibration of the fast-mode cosine
 * floor (RAG_FAST_SCORE_FLOOR / FAST_SCORE_FLOOR_DEFAULT in src/lib/knowledge.ts).
 * Prints top-3 scores for on-topic vs off-topic queries over the REAL corpus.
 */
import process from "node:process";
const { getEmbeddingProvider } = await import(new URL("../../src/lib/embeddings.ts", import.meta.url).href);

const ON_TOPIC = [
  "最近总是失眠,有什么办法能睡好吗?", "怎么缓解焦虑?", "抑郁症能治好吗", "惊恐发作的时候该怎么办",
  "how can I cope with stress", "what helps with depression", "压力大到喘不过气怎么调节", "心理健康是什么"
];
const OFF_TOPIC = [
  "披萨怎么做才好吃", "推荐一部科幻电影", "python 怎么读取文件", "明天上海天气怎么样",
  "how to fix a flat tire", "best travel destinations in Europe", "股票怎么开户", "帮我写一首关于秋天的诗"
];

const base = process.env.QDRANT_URL.replace(/\/$/, "");
const headers = { "api-key": process.env.QDRANT_API_KEY, "Content-Type": "application/json" };
const col = process.env.QDRANT_COLLECTION;
const provider = getEmbeddingProvider();
if (!provider) { console.error("no embedding provider"); process.exit(1); }

async function probe(label, queries) {
  console.log(`\n=== ${label} ===`);
  const scores = [];
  for (const q of queries) {
    const [vec] = await provider.embed([q]);
    const res = await fetch(`${base}/collections/${col}/points/query`, {
      method: "POST", headers,
      body: JSON.stringify({ query: vec, filter: { must: [{ key: "clinicalStatus", match: { value: "approved" } }] }, limit: 3, with_payload: ["title"] })
    });
    const pts = (await res.json()).result?.points ?? [];
    const tops = pts.map((p) => p.score.toFixed(3)).join(" ");
    scores.push(pts[0]?.score ?? 0);
    console.log(`  ${(pts[0]?.score ?? 0).toFixed(3)}  [${tops}]  ${q.slice(0, 26)}  → ${pts[0]?.payload?.title ?? "-"}`);
  }
  return scores;
}

const on = await probe("ON-TOPIC (top-1 should stay ABOVE the floor)", ON_TOPIC);
const off = await probe("OFF-TOPIC (top-1 should fall BELOW the floor)", OFF_TOPIC);
console.log(`\non-topic  min top-1: ${Math.min(...on).toFixed(3)}`);
console.log(`off-topic max top-1: ${Math.max(...off).toFixed(3)}`);
console.log(`→ pick floor between the two (current default 0.45; env RAG_FAST_SCORE_FLOOR overrides)`);
