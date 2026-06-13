import { cleanAssistantText } from "@/lib/output-style";
import { checkRateLimit, rateLimitResponse, readRateLimitEnv } from "@/lib/rate-limit";
import { resolvePersona, type PersonaId } from "@/lib/personas";
import { reviewResponse } from "@/lib/review";
import { assessConversationRisk, assessRisk } from "@/lib/safety";
import type { CaseMap, ChatMessage, MentalState, TurnPlan } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type ReviewRequest = {
  draftResponse: string;
  lastUserMessage: string;
  messages?: ChatMessage[];
  turnPlan: TurnPlan;
  caseMap: CaseMap;
  mentalState?: MentalState | null;
  personaId?: PersonaId;
};

function sanitizeMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => {
      return (
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
      );
    })
    .slice(-16)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 3000)
    }));
}

export async function POST(request: Request) {
  const reviewLimit = checkRateLimit(request, {
    keyPrefix: "review",
    ...readRateLimitEnv("REVIEW_RATE_LIMIT_MAX", "REVIEW_RATE_LIMIT_WINDOW_MS", 30, 60_000)
  });
  if (!reviewLimit.allowed) {
    return rateLimitResponse(reviewLimit);
  }

  let body: ReviewRequest;

  try {
    body = (await request.json()) as ReviewRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.draftResponse || !body.lastUserMessage) {
    return Response.json({ approved: true, finalResponse: body.draftResponse ?? "" });
  }

  const messages = sanitizeMessages(body.messages ?? []);
  const risk = messages.length > 0 ? assessConversationRisk(messages) : assessRisk(body.lastUserMessage);

  if (
    risk.shouldEscalate ||
    risk.flags.includes("medical_red_flag") ||
    risk.flags.includes("medication_request") ||
    risk.flags.includes("diagnosis_request") ||
    risk.flags.includes("safety_confirmation") ||
    risk.flags.includes("suicide_concern")
  ) {
    return Response.json({ approved: true, finalResponse: body.draftResponse });
  }

  const persona = resolvePersona(body.personaId);

  try {
    const result = await reviewResponse({
      draftResponse: body.draftResponse,
      lastUserMessage: body.lastUserMessage,
      turnPlan: body.turnPlan,
      caseMap: body.caseMap,
      mentalState: body.mentalState ?? null,
      risk,
      persona
    });

    const finalResponse = result.approved || !result.revisedResponse
      ? body.draftResponse
      : cleanAssistantText(result.revisedResponse) || body.draftResponse;

    return Response.json({
      approved: result.approved,
      finalResponse,
      issues: result.issues
    });
  } catch (error) {
    // Review is a quality pass on an already safety-screened draft. If the
    // reviewer model fails, pass the draft through unchanged rather than crash.
    console.error("[review] review failed, passing draft through:", error instanceof Error ? error.message : error);
    return Response.json({ approved: true, finalResponse: body.draftResponse });
  }
}
