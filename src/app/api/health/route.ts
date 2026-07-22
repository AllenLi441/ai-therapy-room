import { isKimiConfigured } from "@/lib/kimi";
import { getChatLlmHealth } from "@/lib/chat-monitoring";
import { DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_MAX_RETRIES } from "@/lib/net";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operational health + safety-posture endpoint.
 *
 * Two silent failures this surfaces:
 *  - implicit-risk (Kimi semantic) layer OFF when KIMI_API_KEY is missing;
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
export function GET() {
  const kimiConfigured = isKimiConfigured();
  const deepseekConfigured = Boolean(process.env.DEEPSEEK_API_KEY);
  const conversationLlm = getChatLlmHealth();

  const degraded = !kimiConfigured || !conversationLlm.healthy;
  const okStatus = deepseekConfigured && conversationLlm.healthy;

  const note = !conversationLlm.healthy
    ? `DEGRADED: conversation LLM failing (${conversationLlm.consecutiveFailures} consecutive fallbacks, ${conversationLlm.recentFailures} in 5m). Check DEEPSEEK_API_KEY / quota / DEEPSEEK_MODEL.`
    : kimiConfigured
      ? "dual-model active: implicit-risk semantic layer enabled"
      : "DEGRADED: KIMI_API_KEY missing — implicit-risk LLM layer OFF (lexicon/regex fail-closed layer still active)";

  const body = {
    appVersion: APP_VERSION,
    ok: okStatus,
    implicitRiskLayerActive: kimiConfigured,
    models: { deepseekConfigured, kimiConfigured },
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
