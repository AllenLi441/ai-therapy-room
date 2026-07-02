/**
 * scripts/ingest/fetch-page.mjs — polite, fail-safe page fetcher.
 * robots.txt respected · ≥INGEST_RATE_MS per host · final-host asserted · raw cache.
 * Returns { rawHtml, finalUrl } or null (logged + skipped; a run never dies on one page).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sleep } from "./util.mjs";

const UA = "jingshi-ingest/1.0 (mental-health knowledge base; contact: repo owner)";
const RATE_MS = Number.parseInt(process.env.INGEST_RATE_MS ?? "1200", 10);
const TIMEOUT_MS = 20000;
const CACHE_DIR = new URL("./.cache/", import.meta.url);

const robotsCache = new Map(); // host → disallowed path prefixes (for UA *)
const lastHit = new Map();     // host → ts

async function disallowedPrefixes(host) {
  if (robotsCache.has(host)) return robotsCache.get(host);
  let prefixes = [];
  try {
    const res = await fetchWithTimeout(`https://${host}/robots.txt`);
    if (res?.ok) {
      const text = await res.text();
      let applies = false;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, "").trim();
        const [k, ...rest] = line.split(":");
        const v = rest.join(":").trim();
        if (/^user-agent$/i.test(k)) applies = v === "*";
        else if (applies && /^disallow$/i.test(k) && v) prefixes.push(v);
      }
    }
  } catch { /* unreadable robots → be permissive but rate-limited */ }
  robotsCache.set(host, prefixes);
  return prefixes;
}

function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

export async function fetchPage({ url, expectedHost }) {
  try {
    const u = new URL(url);

    // read-through raw cache: re-clean/re-chunk without network
    const cacheFile = new URL(createHash("sha1").update(url).digest("hex") + ".html", CACHE_DIR);
    if (!process.env.INGEST_NO_CACHE) {
      try {
        const cached = await readFile(cacheFile, "utf8");
        if (cached) return { rawHtml: cached, finalUrl: url, fromCache: true };
      } catch { /* miss */ }
    }

    const dis = await disallowedPrefixes(u.host);
    if (dis.some((p) => u.pathname.startsWith(p))) {
      console.warn(`  ✗ robots.txt disallows ${u.pathname} on ${u.host} — skipped`);
      return null;
    }

    const since = Date.now() - (lastHit.get(u.host) ?? 0);
    if (since < RATE_MS) await sleep(RATE_MS - since);
    lastHit.set(u.host, Date.now());

    const res = await fetchWithTimeout(url);
    if (!res.ok) { console.warn(`  ✗ HTTP ${res.status} — ${url}`); return null; }
    const finalUrl = res.url || url;
    if (new URL(finalUrl).host !== expectedHost) {
      console.warn(`  ✗ redirected off-allowlist (${new URL(finalUrl).host}) — ${url}`);
      return null;
    }
    const rawHtml = await res.text();
    if (rawHtml.length < 2000) { console.warn(`  ✗ suspiciously small page (${rawHtml.length}B) — ${url}`); return null; }

    try { await mkdir(CACHE_DIR, { recursive: true }); await writeFile(cacheFile, rawHtml, "utf8"); } catch { /* cache best-effort */ }
    return { rawHtml, finalUrl, fromCache: false };
  } catch (err) {
    console.warn(`  ✗ fetch failed (${err?.message ?? err}) — ${url}`);
    return null;
  }
}
