import { generateSessionPlan } from "@/lib/case-formulation";
import { sanitizeConversation } from "@/lib/conversation-window";
import { resolvePersona, type PersonaId } from "@/lib/personas";
import { activateCrisisSessionRisk, assessRisk } from "@/lib/safety";
import type {
  CaseMap,
  ChatMessage,
  ConsultGoal,
  IntakeProfile,
  ScaleResult
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type PlanRequest = {
  messages?: ChatMessage[];
  profile?: IntakeProfile;
  caseMap?: CaseMap | null;
  scaleResults?: ScaleResult[];
  consultGoal?: ConsultGoal | null;
  personaId?: PersonaId;
  crisisModeActive?: boolean;
  language?: "zh" | "en";
};

export async function POST(request: Request) {
  let body: PlanRequest;

  try {
    body = (await request.json()) as PlanRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !Array.isArray(body.messages) || body.messages.length > 120 || body.messages.some((message) => !message || typeof message.content !== "string" || !["user", "assistant"].includes(message.role))) {
    return Response.json({ error: "Invalid messages" }, { status: 400 });
  }
  const messages = sanitizeConversation(body.messages);
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (!latestUserMessage) {
    return Response.json({ error: "Missing user message" }, { status: 400 });
  }

  const baseRisk = assessRisk(latestUserMessage.content);
  const risk = body.crisisModeActive ? activateCrisisSessionRisk(baseRisk) : baseRisk;
  const persona = resolvePersona(body.personaId);

  try {
  const plan = await generateSessionPlan({
    profile: body.profile,
    messages,
    priorCaseMap: body.caseMap ?? null,
    scaleResults: body.scaleResults,
    risk,
    consultGoal: body.consultGoal ?? null,
    persona,
    language: body.language === "en" ? "en" : "zh",
    requireFresh: true,
  });

  return Response.json({
    plan,
    risk: {
      level: risk.level,
      shouldEscalate: risk.shouldEscalate,
      rationale: risk.rationale,
      flags: risk.flags,
      categories: risk.categories
    }
  });
  } catch {
    return Response.json({ error: "plan_unavailable", retryable: true }, { status: 503 });
  }
}
