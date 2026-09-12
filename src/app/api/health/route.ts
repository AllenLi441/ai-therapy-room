import { getKimiConfig, isKimiConfigured } from "@/lib/kimi";
import { getChatLlmHealth } from "@/lib/chat-monitoring";
import { DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_MAX_RETRIES } from "@/lib/net";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operational health + safety-posture endpoint.
 *
 * Two silent failures this surfaces:
 *  - implicit-risk (Kimi semantic) layer OFF when its provider key is missing;
 *  - the conversation LLM repeatedly falling back (key missing / no quota / wrong
 *    model env) while /api/chat still returns 200. The runtime fallback counter is
 *    folded in here so an uptime monitor polling /api/health flips to 503 when the
 *    LLM is failing — without changing /api/chat's graceful 200 path.
 *
 * Reports only booleans/counts, never key values or user data. NOTE: the LLM
 * health counter is in-memory per serverless instance (best-effort), so a poll may
 * hit an instance that hasn't seen the failures; the `[CHAT_LLM_ALERT]` log line is
 * the complementary signal.
 */
export function GET(request?: Request) {
  const configuredVersion = process.env.APP_RELEASE_VERSION?.trim();
  const appVersion = configuredVersion && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(configuredVersion)
    ? configuredVersion
    : APP_VERSION;
  const configuredCommit = process.env.APP_BUILD_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA;
  const buildCommit = configuredCommit && /^[0-9a-f]{7,40}$/i.test(configuredCommit)
    ? configuredCommit.toLowerCase()
    : null;
  const release = { appVersion, buildCommit };

  // Container/CI liveness checks must not need provider keys or spend API quota.
  // The default endpoint below remains the configuration/observed-error check.
  if (request && new URL(request.url).searchParams.get("check") === "liveness") {
    return Response.json({ ok: true, check: "liveness", ...release }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const kimiConfig = getKimiConfig();
  const kimiConfigured = isKimiConfigured();
  const deepseekConfigured = Boolean(process.env.DEEPSEEK_API_KEY);
  const conversationLlm = getChatLlmHealth();

  const observedFailure = conversationLlm.healthy === false;
  const degraded = !deepseekConfigured || !kimiConfigured || observedFailure;
  const okStatus = deepseekConfigured && !observedFailure;

  const note = !deepseekConfigured
    ? "DEGRADED: conversation provider key missing"
    : observedFailure
      ? `DEGRADED: conversation LLM failing (${conversationLlm.consecutiveFailures} consecutive fallbacks, ${conversationLlm.recentFailures} in 5m). Check DEEPSEEK_API_KEY / quota / DEEPSEEK_MODEL.`
    : kimiConfigured
      ? conversationLlm.healthy === true
        ? "provider configuration present; recent conversation calls observed healthy on this instance"
        : "provider configuration present; no recent conversation call observed on this instance (provider availability unverified)"
      : `DEGRADED: ${kimiConfig.provider} Kimi key missing — implicit-risk LLM layer OFF (lexicon/regex fail-closed layer still active)`;

  const body = {
    ...release,
    check: "configuration-and-observed-errors",
    ok: okStatus,
    implicitRiskLayerActive: kimiConfigured,
    models: {
      deepseekConfigured,
      kimiConfigured,
      kimiProvider: kimiConfig.provider,
      kimiModel: kimiConfig.model,
    },
    conversationLlm,
    transport: {
      connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      maxAttempts: DEFAULT_MAX_RETRIES + 1,
    },
    degraded,
    note
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: okStatus ? 200 : 503,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
