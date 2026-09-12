import { cpSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { verifyDeployment } from "./check-deployment.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const standalone = resolve(root, ".next/standalone");
assert(existsSync(resolve(standalone, "server.js")), "Build standalone output first with npm run build");
cpSync(resolve(root, "public"), resolve(standalone, "public"), { recursive: true });
cpSync(resolve(root, ".next/static"), resolve(standalone, ".next/static"), { recursive: true });
const reservation = createServer();
await new Promise((ok, fail) => { reservation.once("error", fail); reservation.listen(0, "127.0.0.1", ok); });
const port = reservation.address().port;
await new Promise((ok) => reservation.close(ok));
const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const commit = process.env.APP_BUILD_COMMIT || "1234567abcdef";
const child = spawn(process.execPath, [resolve(standalone, "server.js")], {
  cwd: standalone,
  env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", APP_RELEASE_VERSION: version, APP_BUILD_COMMIT: commit },
  stdio: "ignore",
});
let launchError;
child.once("error", (error) => { launchError = error; });
const origin = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error("Standalone server exited before it was ready");
    try {
      const response = await fetch(`${origin}/api/health?check=liveness`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch { /* wait for local startup only */ }
    await new Promise((ok) => setTimeout(ok, 250));
  }
  assert(ready, "Standalone server did not become ready within 20 seconds");
  await verifyDeployment({ url: origin, version, commit, livenessOnly: true });
  const page = await fetch(origin);
  assert(page.ok, "Standalone homepage is unavailable");
  const html = await page.text();
  assert(!/https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(html), "Homepage still requests Google Fonts at runtime");
  const asset = html.match(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/)?.[1];
  assert(asset, "Homepage has no built static asset");
  assert((await fetch(new URL(asset, origin))).ok, "Standalone static assets are unavailable");
  console.log(`Standalone release ${version} passed: homepage, static assets, liveness and commit.`);
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((ok) => {
      const timeout = setTimeout(() => { child.kill("SIGKILL"); ok(); }, 5_000);
      child.once("exit", () => { clearTimeout(timeout); ok(); });
    });
  }
}
