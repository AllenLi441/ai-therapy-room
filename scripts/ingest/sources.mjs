/**
 * scripts/ingest/sources.mjs — 来源登记表(M2 slice 1)
 *
 * The ingest ALLOWLIST itself. Only URLs listed here are ever fetched; the fetcher
 * additionally asserts the FINAL (post-redirect) host equals expectedHost so a redirect
 * can't smuggle an off-list page in.
 *
 * Slice-1 policy (critic-reviewed):
 *   - Reliably server-rendered, license-clean orgs only: WHO (zh+en) + NIMH + CDC.
 *     NHS EMM / 卫健委 deferred to a later pass (JS-render + license ambiguity).
 *   - trustTier 'authoritative' → chunks auto-approve IF the verbatim-quote check passes.
 *   - safetySensitive (suicide/self-harm subject matter) → chunks land 'pending' (INERT,
 *     never retrieved) until a human signs off. Conservative by design.
 *   - license is documentation for humans, not logic. WHO = CC BY-NC-SA 3.0 IGO (short
 *     quotes + attribution + private passage storage only; NO quote text committed to the
 *     repo). NIMH/CDC = US-gov public domain.
 */

export const SOURCES = [
  // ---- WHO fact sheets · 中文 ----
  { sourceId: "who-depression-zh", org: "世界卫生组织 (WHO)", lang: "zh", trustTier: "authoritative",
    topic: "抑郁", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/zh/news-room/fact-sheets/detail/depression", enabled: true },
  { sourceId: "who-anxiety-zh", org: "世界卫生组织 (WHO)", lang: "zh", trustTier: "authoritative",
    topic: "焦虑", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/zh/news-room/fact-sheets/detail/anxiety-disorders", enabled: true },
  { sourceId: "who-mental-health-zh", org: "世界卫生组织 (WHO)", lang: "zh", trustTier: "authoritative",
    topic: "心理健康", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/zh/news-room/fact-sheets/detail/mental-health-strengthening-our-response", enabled: true },
  { sourceId: "who-mental-disorders-zh", org: "世界卫生组织 (WHO)", lang: "zh", trustTier: "authoritative",
    topic: "心理障碍", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/zh/news-room/fact-sheets/detail/mental-disorders", enabled: true },
  { sourceId: "who-suicide-zh", org: "世界卫生组织 (WHO)", lang: "zh", trustTier: "authoritative",
    topic: "自杀预防", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/zh/news-room/fact-sheets/detail/suicide", enabled: true,
    safetySensitive: true }, // → pending,人工放行前永不检索

  // ---- WHO fact sheets · English ----
  { sourceId: "who-depression-en", org: "World Health Organization", lang: "en", trustTier: "authoritative",
    topic: "depression", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/news-room/fact-sheets/detail/depression", enabled: true },
  { sourceId: "who-anxiety-en", org: "World Health Organization", lang: "en", trustTier: "authoritative",
    topic: "anxiety", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders", enabled: true },
  { sourceId: "who-mental-health-en", org: "World Health Organization", lang: "en", trustTier: "authoritative",
    topic: "mental health", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/news-room/fact-sheets/detail/mental-health-strengthening-our-response", enabled: true },
  { sourceId: "who-suicide-en", org: "World Health Organization", lang: "en", trustTier: "authoritative",
    topic: "suicide prevention", license: "CC BY-NC-SA 3.0 IGO", expectedHost: "www.who.int",
    url: "https://www.who.int/news-room/fact-sheets/detail/suicide", enabled: true,
    safetySensitive: true },

  // ---- NIMH topic pages (US public domain) ----
  { sourceId: "nimh-anxiety", org: "National Institute of Mental Health (NIMH)", lang: "en", trustTier: "authoritative",
    topic: "anxiety", license: "US public domain", expectedHost: "www.nimh.nih.gov",
    url: "https://www.nimh.nih.gov/health/topics/anxiety-disorders", enabled: true },
  { sourceId: "nimh-depression", org: "National Institute of Mental Health (NIMH)", lang: "en", trustTier: "authoritative",
    topic: "depression", license: "US public domain", expectedHost: "www.nimh.nih.gov",
    url: "https://www.nimh.nih.gov/health/topics/depression", enabled: true },
  { sourceId: "nimh-panic", org: "National Institute of Mental Health (NIMH)", lang: "en", trustTier: "authoritative",
    topic: "panic disorder", license: "US public domain", expectedHost: "www.nimh.nih.gov",
    // /health/topics/panic-disorder 已 404(NIMH 改版);出版物页是现行地址
    url: "https://www.nimh.nih.gov/health/publications/panic-disorder-when-fear-overwhelms", enabled: true },
  { sourceId: "nimh-caring", org: "National Institute of Mental Health (NIMH)", lang: "en", trustTier: "authoritative",
    topic: "self-care", license: "US public domain", expectedHost: "www.nimh.nih.gov",
    url: "https://www.nimh.nih.gov/health/topics/caring-for-your-mental-health", enabled: true },

  // ---- CDC (US public domain) ----
  { sourceId: "cdc-sleep", org: "Centers for Disease Control and Prevention (CDC)", lang: "en", trustTier: "authoritative",
    topic: "sleep", license: "US public domain", expectedHost: "www.cdc.gov",
    url: "https://www.cdc.gov/sleep/about/index.html", enabled: true },
  { sourceId: "cdc-coping", org: "Centers for Disease Control and Prevention (CDC)", lang: "en", trustTier: "authoritative",
    topic: "coping with stress", license: "US public domain", expectedHost: "www.cdc.gov",
    url: "https://www.cdc.gov/mental-health/living-with/index.html", enabled: true },
  { sourceId: "cdc-mental-health", org: "Centers for Disease Control and Prevention (CDC)", lang: "en", trustTier: "authoritative",
    topic: "mental health", license: "US public domain", expectedHost: "www.cdc.gov",
    url: "https://www.cdc.gov/mental-health/about/index.html", enabled: true }
];

export function enabledSources() {
  return SOURCES.filter((s) => s.enabled);
}
