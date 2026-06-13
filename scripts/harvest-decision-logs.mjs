#!/usr/bin/env node
/**
 * scripts/harvest-decision-logs.mjs
 *
 * Reads logs/decisions-*.jsonl (written by src/lib/decision-log.ts in
 * production) and produces evals/fp-fn-candidates.jsonl candidates for
 * downstream preannotation.
 *
 * Heuristics for "this needs human review" (matches the cases most likely
 * to be FP / FN / miscalibrated):
 *
 *   1. implicit_fail_safe route — Kimi errored and we conservatively
 *      escalated; this is almost always a manual-review candidate.
 *   2. implicit_crisis where confidence < 0.5 — borderline auto-escalation,
 *      should be sanity-checked.
 *   3. deepseek_normal where lexicon level was "low" — possibly we let
 *      something through that should have been escalated.
 *   4. lexicon_suicide_concern where implicit (when run) said pragmatic !=
 *      self — possibly false positive from regex matches in
 *      hyperbolic / quoted / third-person content.
 *   5. lexicon_crisis where implicit said pragmatic = sarcasm_hyperbole and
 *      confidence > 0.7 — over-triage is by design, but log so we can
 *      measure how often it happens.
 *
 * Usage:
 *   node scripts/harvest-decision-logs.mjs
 *   node scripts/harvest-decision-logs.mjs --since 2026-05-20
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const logsDir = new URL("../logs/", import.meta.url);
const outFile = new URL("../evals/fp-fn-candidates.jsonl", import.meta.url);

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1]);
}
const sinceDate = args.get("--since"); // e.g. 2026-05-20

let files;
try {
  files = (await readdir(logsDir.pathname))
    .filter((f) => f.startsWith("decisions-") && f.endsWith(".jsonl"))
    .filter((f) => !sinceDate || f.slice("decisions-".length, "decisions-".length + 10) >= sinceDate)
    .sort();
} catch {
  console.error("No logs/ directory found. The decision log is written by /api/chat in production.");
  process.exit(2);
}

if (files.length === 0) {
  console.error("No decision-log files matching the filter.");
  process.exit(0);
}

const buckets = {
  fail_safe: [],
  borderline_implicit_crisis: [],
  released_with_low: [],
  lexicon_pragmatic_disagreement: [],
  lexicon_over_triage: []
};

let totalEntries = 0;

for (const f of files) {
  const text = await readFile(path.join(logsDir.pathname, f), "utf-8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    totalEntries++;

    // 1. fail-safe path
    if (entry.route === "implicit_fail_safe") {
      buckets.fail_safe.push(entry);
      continue;
    }

    // 2. borderline implicit crisis
    if (entry.route === "implicit_crisis" && entry.implicit?.kind === "ok") {
      if ((entry.implicit.confidence ?? 0) < 0.5) {
        buckets.borderline_implicit_crisis.push(entry);
      }
      continue;
    }

    // 3. deepseek release with at-least-low lexicon
    if (entry.route === "deepseek_normal" && entry.lexicon?.level === "low") {
      buckets.released_with_low.push(entry);
      continue;
    }

    // 4. lexicon escalated but LLM said pragmatic != self
    if (
      (entry.route === "lexicon_suicide_concern" || entry.route === "lexicon_crisis") &&
      entry.implicit?.kind === "ok" &&
      entry.implicit?.pragmatic &&
      entry.implicit.pragmatic !== "self" &&
      entry.implicit.pragmatic !== "uncertain_ambivalent"
    ) {
      buckets.lexicon_pragmatic_disagreement.push(entry);
      continue;
    }

    // 5. lexicon crisis but implicit said sarcasm with high confidence
    if (
      entry.route === "lexicon_crisis" &&
      entry.implicit?.kind === "ok" &&
      entry.implicit.pragmatic === "sarcasm_hyperbole" &&
      (entry.implicit.confidence ?? 0) > 0.7
    ) {
      buckets.lexicon_over_triage.push(entry);
      continue;
    }
  }
}

const reasonLabels = {
  fail_safe: "FAIL_SAFE",
  borderline_implicit_crisis: "BORDERLINE_IMPLICIT_CRISIS",
  released_with_low: "RELEASED_WITH_LOW_LEXICON",
  lexicon_pragmatic_disagreement: "LEXICON_PRAGMATIC_DISAGREEMENT",
  lexicon_over_triage: "LEXICON_OVER_TRIAGE"
};

const candidates = [];
for (const [bucket, entries] of Object.entries(buckets)) {
  for (const e of entries) {
    candidates.push({
      case_id: `LOG-${e.sessionHash}-${e.turnIndex}`,
      title: `production log · ${reasonLabels[bucket]}`,
      verdict: bucket === "released_with_low" ? "FN_CANDIDATE" : "FP_CANDIDATE",
      note: `harvested from production log: ${reasonLabels[bucket]}`,
      expected_route: null,
      actual_route: e.route,
      user_message: e.userMessage,
      conversation: null,
      plan_risk: { level: e.lexicon?.level, flags: e.lexicon?.flags },
      response_preview: null,
      production_log: {
        ts: e.ts,
        sessionHash: e.sessionHash,
        lexicon: e.lexicon,
        implicit: e.implicit,
        implicitDecision: e.implicitDecision,
        crisisModeActive: e.crisisModeActive
      }
    });
  }
}

await mkdir(new URL("../evals/", import.meta.url), { recursive: true });
await writeFile(
  outFile,
  candidates.map((c) => JSON.stringify(c)).join("\n") + (candidates.length ? "\n" : ""),
  "utf-8"
);

console.log(`Read ${totalEntries} log entries from ${files.length} file(s).`);
console.log("");
console.log("Candidate buckets:");
for (const [k, v] of Object.entries(buckets)) {
  console.log(`  ${reasonLabels[k]}: ${v.length}`);
}
console.log("");
console.log(`Wrote ${candidates.length} candidates → evals/fp-fn-candidates.jsonl`);
console.log("Next: npm run w1:preannotate && npm run w1:append-seeds");
