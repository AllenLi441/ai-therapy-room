import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import cases from "../eval/datasets/rag-regression/cases.json";
import legacy from "../eval/datasets/rag-regression/legacy-cards.json";
import { buildKnowledgeQuery } from "../src/lib/knowledge-query";
import { isInfoSeeking, keywordRetrieve, retrieveKnowledge } from "../src/lib/knowledge";
import { assessRisk } from "../src/lib/safety";
import type { KnowledgeCard } from "../src/lib/types";

// A reproducible offline engineering regression report. It does not call a judge or
// generate responses, and the authored development cases are explicitly not human gold.
process.env.EMBEDDING_API_KEY = "";
process.env.LOCAL_EMBEDDING_URL = "";
process.env.QDRANT_URL = "";
process.env.SEARCH_API_KEY = "";
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("offline evaluation forbids network"); };

function safeToRetrieve(query: string): boolean {
  const risk = assessRisk(query);
  return !risk.shouldEscalate && !risk.flags.some((flag) =>
    ["suicide_concern", "medication_request", "diagnosis_request", "medical_red_flag"].includes(flag));
}

async function main() {
  const rows = [];
  for (const test of cases) {
    const safe = safeToRetrieve(test.query);
    const query = buildKnowledgeQuery([{ role: "user", content: test.query }]);
    const before = safe && isInfoSeeking(test.query)
      ? keywordRetrieve(test.query, 4, legacy as KnowledgeCard[]) : [];
    const after = safe && query.query ? await retrieveKnowledge(query.query, 4, { fastMode: true }) : [];
    const expected = test.expectedRoute === "general_information";
    rows.push({
      id: test.id, query: test.query, expectedRoute: test.expectedRoute, retrievalQuery: query.query,
      expectedCardIds: test.expectedCardIds,
      beforeIds: before.map((card) => card.id), afterIds: after.map((card) => card.id),
      beforeSourceHit: expected && before.some((card) => test.expectedAnySourceUrls.includes(card.sourceUrl ?? "")),
      afterSourceHit: expected && after.some((card) => test.expectedAnySourceUrls.includes(card.sourceUrl ?? "")),
      afterCardHit: expected && after.some((card) => test.expectedCardIds.includes(card.id)),
      beforeCorrectAbstention: !expected && before.length === 0,
      afterCorrectAbstention: !expected && after.length === 0,
    });
  }
  const positiveCount = rows.filter((row) => row.expectedRoute === "general_information").length;
  const negativeCount = rows.length - positiveCount;
  const report = {
    scope: "Offline authored development regression; not held-out clinical gold, not response quality, not production vector evaluation.",
    testSetSha256: createHash("sha256").update(JSON.stringify(cases)).digest("hex"),
    baseline: "Frozen pre-change committed local card corpus + prior latest-turn keyword retrieval and deterministic safety gate; no vectors or API calls.",
    updated: "Source-verified local reference channel + topic/facet-only context builder + same deterministic safety gate.",
    positiveCount, negativeCount, networkCalls,
    before: { sourceRecallAt4: rows.filter((row) => row.beforeSourceHit).length / positiveCount, correctAbstention: rows.filter((row) => row.beforeCorrectAbstention).length / negativeCount },
    after: { sourceRecallAt4: rows.filter((row) => row.afterSourceHit).length / positiveCount, expectedCardRecallAt4: rows.filter((row) => row.afterCardHit).length / positiveCount, correctAbstention: rows.filter((row) => row.afterCorrectAbstention).length / negativeCount },
    failures: rows.filter((row) => row.expectedRoute === "general_information" ? !row.afterCardHit : !row.afterCorrectAbstention),
    rows,
  };
  const outputPath = process.argv[2];
  if (outputPath) writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, failures: report.failures.map((row) => ({ id: row.id, query: row.query, retrievalQuery: row.retrievalQuery, afterIds: row.afterIds })), rows: undefined }, null, 2));
  if (networkCalls > 0) process.exitCode = 1;
}

void main();
