import { buildDeepSeekPayload, generateDeepSeekText } from "@/lib/deepseek";
import { resolveDeepSeekModel, type DeepSeekModelId } from "@/lib/model-options";
import { cleanAssistantText } from "@/lib/output-style";
import { buildSummaryPrompt, createHeuristicSummary } from "@/lib/prompts";
import { assessRisk } from "@/lib/safety";
import type { AppLanguage, CaseMap, ChatMessage, IntakeProfile, ScaleResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type SummaryRequest = {
  messages?: ChatMessage[];
  profile?: IntakeProfile;
  caseMap?: CaseMap | null;
  scaleResults?: ScaleResult[];
  language?: AppLanguage;
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
    .slice(-30)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 2200)
    }));
}

export async function POST(request: Request) {
  let body: SummaryRequest;

  try {
    body = (await request.json()) as SummaryRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = sanitizeMessages(body.messages ?? []);
  const language: AppLanguage = body.language === "en" ? "en" : "zh";

  if (messages.length === 0) {
    return Response.json({
      summary: language === "en" ? "There is not enough conversation yet to summarize." : "还没有足够的对话内容可以总结。"
    });
  }

  const risk = assessRisk(messages.map((message) => message.content).join("\n"));
  const systemPrompt =
    language === "en"
      ? "You are a cautious, concise psychological support session note assistant. Write in English."
      : "你是谨慎、克制的中文心理支持会话记录助手。";
  const userPrompt = buildSummaryPrompt({
    profile: body.profile,
    messages,
    risk,
    caseMap: body.caseMap ?? null,
    scaleResults: body.scaleResults,
    language
  });

  try {
    const summary = await generateDeepSeekText(
      buildDeepSeekPayload({
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        stream: false,
        maxTokens: 750
      })
    );

    return Response.json({ summary: cleanAssistantText(summary) || createHeuristicSummary(messages, risk, language) });
  } catch {
    return Response.json({ summary: createHeuristicSummary(messages, risk, language) });
  }
}
