import { randomUUID } from "node:crypto";
import { checkRateLimit, rateLimitResponse, readRateLimitEnv } from "@/lib/rate-limit";
import { DONATION_AGE_BRACKETS, DONATION_CONSENT_VERSION, deleteDonation, donationsConfigured, upsertDonation, type DonatedMessage } from "@/lib/donations";
import { parseLanguage } from "@/lib/languages";
import { parseSupportRegion } from "@/lib/support-regions";
import { redactText } from "@/lib/redact";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFETY = ["safe", "unchecked", "gentle", "suicide_concern", "crisis"];

type DonateRequest = {
  id?: unknown;
  messages?: unknown;
  ageBracket?: unknown;
  language?: unknown;
  supportRegion?: unknown;
  consentVersion?: unknown;
};

function readMessages(value: unknown): DonatedMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 240) return null;
  const messages: DonatedMessage[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const { role, content, safety, pace, feedback } = row as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim() || content.length > 12000) return null;
    messages.push({
      role, content: redactText(content.trim()),
      ...(typeof safety === "string" && SAFETY.includes(safety) ? { safety } : {}),
      ...(pace === "deep" || pace === "fast" ? { pace } : {}),
      ...(feedback === "up" || feedback === "down" ? { feedback } : {}),
    });
  }
  return messages.some((message) => message.role === "user") ? messages : null;
}

function limited(request: Request) {
  const limit = checkRateLimit(request, { keyPrefix: "donate", ...readRateLimitEnv("DONATE_RATE_LIMIT_MAX", "DONATE_RATE_LIMIT_WINDOW_MS", 120, 600_000) });
  return limit.allowed ? null : rateLimitResponse(limit);
}

export async function POST(request: Request) {
  const blocked = limited(request);
  if (blocked) return blocked;
  if (!donationsConfigured()) return Response.json({ error: "donations_disabled" }, { status: 503 });
  let body: DonateRequest;
  try { body = (await request.json()) as DonateRequest; } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const messages = readMessages(body?.messages);
  const conversationId = body?.id === undefined ? randomUUID() : body.id;
  const language = parseLanguage(body?.language);
  const supportRegion = body?.supportRegion === undefined ? null : parseSupportRegion(body.supportRegion);
  if (!messages || !language || (body.supportRegion !== undefined && !supportRegion) || typeof conversationId !== "string" || !UUID.test(conversationId) ||
      !DONATION_AGE_BRACKETS.includes(body.ageBracket as never) || body.consentVersion !== DONATION_CONSENT_VERSION) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const id = conversationId;
  try {
    await upsertDonation({
      id, consent_version: DONATION_CONSENT_VERSION, age_bracket: body.ageBracket as (typeof DONATION_AGE_BRACKETS)[number],
      language, support_region: supportRegion, app_version: APP_VERSION, messages,
    });
  } catch {
    return Response.json({ error: "donation_failed" }, { status: 502 });
  }
  return Response.json({ id });
}

/** Deletion: the random conversation id is the user's only handle, kept in their browser. */
export async function DELETE(request: Request) {
  const blocked = limited(request);
  if (blocked) return blocked;
  if (!donationsConfigured()) return Response.json({ error: "donations_disabled" }, { status: 503 });
  let id: unknown;
  try { id = ((await request.json()) as { id?: unknown })?.id; } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (typeof id !== "string" || !UUID.test(id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try { await deleteDonation(id); } catch { return Response.json({ error: "withdraw_failed" }, { status: 502 }); }
  return Response.json({ ok: true });
}
