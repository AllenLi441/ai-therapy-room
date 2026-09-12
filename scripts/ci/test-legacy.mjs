import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const fixtures = [
  "src/lib/crisis-corpus.json",
  "evals/detection-seed-corpus.json",
  "evals/detection-redteam-corpus.json",
];
const missing = fixtures.filter((file) => !existsSync(new URL(file, root)));
if (missing.length) {
  console.error(`Legacy evaluation BLOCKED: ${missing.length} missing original fixture(s):`);
  for (const file of missing) console.error(`- ${file}`);
  console.error("Restore the original files with verified provenance; see eval/legacy/README.md. No historical score or clinical validation has been established.");
  process.exit(1);
}
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("node_modules/vitest/vitest.mjs", root)),
  "run", "--config", "vitest.legacy.config.ts", ...process.argv.slice(2),
], { cwd: fileURLToPath(root), stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
