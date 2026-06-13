import { activateCrisisSessionRisk, assessRisk } from "@/lib/safety";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 10;

type SafetyCheckRequest = {
  messages?: ChatMessage[];
  crisisModeActive?: boolean;
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
  let body: SafetyCheckRequest;

  try {
    body = (await request.json()) as SafetyCheckRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = sanitizeMessages(body.messages ?? []);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!latestUserMessage) {
    return Response.json({ error: "Missing user message" }, { status: 400 });
  }

  const baseRisk = assessRisk(latestUserMessage.content);
  const risk = body.crisisModeActive ? activateCrisisSessionRisk(baseRisk) : baseRisk;

  return Response.json({
    risk,
    safetyBypass:
      risk.shouldEscalate ||
      risk.flags.includes("suicide_concern") ||
      risk.flags.includes("medication_request") ||
      risk.flags.includes("diagnosis_request") ||
      risk.flags.includes("medical_red_flag")
  });
}
