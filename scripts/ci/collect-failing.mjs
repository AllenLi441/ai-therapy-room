// Parse a vitest JSON report (safety-ci/_raw.json) into a stable, sorted list of
// currently-failing test IDs (`file::full test name`). This is the baseline the
// ratchet freezes — CI then fails only on NEW failures, green→red regressions, or
// baseline entries that now pass. Regenerate intentionally (never to hide a new red).
import { readFileSync, writeFileSync } from "node:fs";

const raw = JSON.parse(readFileSync("safety-ci/_raw.json", "utf8"));
const ids = [];
for (const f of raw.testResults ?? []) {
  const file = f.name.split("/").slice(-3).join("/");
  for (const a of f.assertionResults ?? []) {
    if (a.status === "failed") ids.push(`${file}::${a.fullName}`);
  }
}
ids.sort();
writeFileSync("safety-ci/known-failing.json", JSON.stringify(ids, null, 2) + "\n");
console.log(`known-failing: ${ids.length}`);
