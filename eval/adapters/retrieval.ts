import { retrieveKnowledge } from "@/lib/knowledge";
import type { AdapterResult } from "./result";

/** RAG 检索臂。prediction=命中卡片 id[];空数组=弃答(abstention)。
 *  raw 保留完整 KnowledgeCard[](含 sourceUrl/sourceQuote,阶段 4 复核逐字引用用)。
 *  注:retrieveKnowledge 不暴露相似度分数;阶段 4 的分数分布实验将直接用
 *  @/lib/qdrant 的 qdrantDenseSearch(已导出),不改 src。 */
export async function runRetrieval(query: string, opts: { mode: "fast" | "deep" }): Promise<AdapterResult> {
  const t0 = performance.now();
  const cards = await retrieveKnowledge(query, 4, { fastMode: opts.mode === "fast" });
  const latencyMs = performance.now() - t0;

  return {
    prediction: cards.map((c) => c.id),
    branch: "retrieval",
    interventionTiming: "none",
    latencyMs,
    raw: cards
  };
}
