// Safety-test ratchet. Runs the full suite and compares against the frozen
// known-failing baseline (safety-ci/known-failing.json). Fails CI on:
//   - a NEW failure not in the baseline (regression / new defect), or
//   - a baseline test that now PASSES (it was fixed — remove it from the baseline
//     so the ratchet only ever tightens, never drifts).
// The ~84 known failures (77 of them real safety-lexicon defects) are the v2 fix
// list; each fix forces its test out of the baseline as it goes green.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// vitest exits non-zero whenever any test fails — which is EXPECTED here (we have
// a baseline of known failures). The JSON report is written regardless, so swallow
// the non-zero exit and let the ratchet comparison below decide pass/fail.
try {
  execSync("npx vitest run --reporter=json --outputFile=safety-ci/_raw.json", { stdio: "inherit" });
} catch {
  /* non-zero exit = some tests failed; the report we need is still on disk */
}
const raw = JSON.parse(readFileSync("safety-ci/_raw.json", "utf8"));
const known = new Set(JSON.parse(readFileSync("safety-ci/known-failing.json", "utf8")));

const id = (f, a) => `${f.name.split("/").slice(-3).join("/")}::${a.fullName}`;
const failing = new Set();
const passing = new Set();
for (const f of raw.testResults ?? []) {
  for (const a of f.assertionResults ?? []) {
    (a.status === "failed" ? failing : passing).add(id(f, a));
  }
}

const newlyFailing = [...failing].filter((x) => !known.has(x)); // regression / new defect
const nowPassing = [...known].filter((x) => passing.has(x));    // fixed → must leave baseline

let bad = false;
if (newlyFailing.length) {
  bad = true;
  console.error(`\n❌ NEW failures (not in baseline) — regression or new defect:\n` + newlyFailing.join("\n"));
}
if (nowPassing.length) {
  bad = true;
  console.error(
    `\n❌ These baseline tests now PASS — remove them from safety-ci/known-failing.json (ratchet tightens):\n` +
      nowPassing.join("\n")
  );
}
if (bad) process.exit(1);
console.log(`\n✅ ratchet OK — ${failing.size} known failures, no new, none silently fixed.`);
