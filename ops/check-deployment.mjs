import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export async function verifyDeployment({ url, version, commit, livenessOnly = false }) {
  const origin = new URL(url);
  assert(["https:", "http:"].includes(origin.protocol), "Use an HTTP(S) deployment URL");
  assert(!origin.username && !origin.password, "Do not pass credentials in a deployment URL");
  const modes = livenessOnly ? ["liveness"] : ["liveness", "configuration"];
  for (const mode of modes) {
    const endpoint = new URL("/api/health", origin);
    if (mode === "liveness") endpoint.searchParams.set("check", "liveness");
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    assert(response.ok, `${mode} health returned HTTP ${response.status}`);
    const body = await response.json();
    assert(body.ok === true, `${mode} health did not report ok`);
    assert(body.appVersion === version, "The served app version differs from the expected release");
    if (commit) assert(body.buildCommit === commit.toLowerCase(), "The served commit differs from the expected release");
    if (mode === "configuration") assert(body.degraded === false, "Provider configuration or observed health is degraded");
  }
  return { origin: origin.origin, version, commit: commit ?? null, checks: modes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const livenessOnly = args.includes("--liveness-only");
  const positional = args.filter((arg) => arg !== "--liveness-only");
  const [url, version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version, commit] = positional;
  if (!url || positional.length > 3) {
    console.error("Usage: node ops/check-deployment.mjs URL [VERSION] [COMMIT] [--liveness-only]");
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(await verifyDeployment({ url, version, commit, livenessOnly })));
    console.log("Release checks passed. This probe does not make or verify a live model request.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release check failed");
    process.exit(1);
  }
}
