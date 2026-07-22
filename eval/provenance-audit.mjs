#!/usr/bin/env node
/**
 * Redacted provenance completeness audit for the synthetic safety dataset.
 *
 * Default mode is descriptive and exits 0 so the current known-incomplete draft can
 * still be inspected. `--release` is the publication gate: every row must have the
 * required provenance object and human_review must no longer be pending.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVAL = dirname(fileURLToPath(import.meta.url));
const REQUIRED = ["origin", "generator", "provider", "model", "prompt_sha256", "created_at", "human_editor", "license"];
const missing = Object.fromEntries(REQUIRED.map((field) => [field, 0]));
let rows = 0;
let complete = 0;
let pending = 0;
let malformed = 0;

function validField(field, value) {
  if (field === "human_editor") return typeof value === "boolean";
  if (field === "prompt_sha256") return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
  if (field === "created_at") return typeof value === "string" && Number.isFinite(Date.parse(value));
  return typeof value === "string" && value.trim().length > 0;
}

for (const dir of ["safety", "multiturn"]) {
  const root = join(EVAL, "datasets", dir);
  for (const filename of readdirSync(root).filter((name) => name.endsWith(".jsonl")).sort()) {
    const lines = readFileSync(join(root, filename), "utf8").split("\n").filter(Boolean);
    for (const [index, line] of lines.entries()) {
      const row = JSON.parse(line);
      if (row._meta) continue;
      rows += 1;
      if (row.human_review === "pending") pending += 1;
      const provenance = row.provenance;
      if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
        for (const field of REQUIRED) missing[field] += 1;
        continue;
      }
      let rowComplete = true;
      for (const field of REQUIRED) {
        if (!validField(field, provenance[field])) {
          missing[field] += 1;
          rowComplete = false;
        }
      }
      if (provenance.origin !== "synthetic" && provenance.origin !== "adapted") {
        malformed += 1;
        rowComplete = false;
      }
      if (rowComplete) complete += 1;
      if (index === 0) malformed += 1; // a data row must never replace the _meta first line
    }
  }
}

const report = {
  status: complete === rows && pending === 0 && malformed === 0 ? "READY" : "NOT_READY",
  rows,
  provenance_complete: complete,
  human_review_pending: pending,
  malformed,
  missing_by_field: missing,
  required_fields: REQUIRED,
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--release") && report.status !== "READY") {
  console.error("release provenance gate FAIL: fill auditable provenance and complete real human review before dataset/resource publication");
  process.exitCode = 1;
}
