import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const source = readFileSync(new URL("../../src/lib/version.ts", import.meta.url), "utf8");
const appVersion = source.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
assert.equal(appVersion, pkg.version, "package.json and APP_VERSION must identify the same release");
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
console.log(`Release version verified: ${pkg.version}`);
