// Kept for older local callers. Every test must pass; known-failure lists no
// longer override the test runner exit status.
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
