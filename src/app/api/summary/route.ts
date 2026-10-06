import { buildDeepSeekPayload, generateDeepSeekText } from "@/lib/deepseek";
import { cleanAssistantText } from "@/lib/output-style";
import { buildSummaryPrompt } from "@/lib/prompts";
import { assessRisk } from "@/lib/safety";
import { localized, normalizeLanguage, replyLanguageName } from "@/lib/languages";
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

  if (!body || typeof body !== "object" || !Array.isArray(body.messages) || body.messages.length > 120 || body.messages.some((message) => !message || typeof message.content !== "string" || !["user", "assistant"].includes(message.role))) {
    return Response.json({ error: "Invalid messages" }, { status: 400 });
  }
  const messages = sanitizeMessages(body.messages);
  const language: AppLanguage = normalizeLanguage(body.language);

  if (messages.length === 0) {
    return Response.json({
      summary: localized(language, {
        zh: "还没有足够的对话内容可以总结。", en: "There is not enough conversation yet to summarize.",
        "zh-Hant": "還沒有足夠的對話內容可以總結。", ja: "まとめられるほどの会話がまだありません。", ko: "아직 요약할 만큼 대화가 충분하지 않아요.",
        es: "Todavía no hay suficiente conversación para resumir.", fr: "Il n’y a pas encore assez de conversation à résumer.", de: "Es gibt noch nicht genug Gespräch für eine Zusammenfassung."
      })
    });
  }

  const risk = assessRisk(messages.filter((message) => message.role === "user").map((message) => message.content).join("\n"));
  const systemPrompt =
    language === "zh" ? "你是谨慎、克制的中文心理支持会话记录助手。"
      : language === "zh-Hant" ? "你是谨慎、克制的心理支持会话记录助手。全部使用繁体中文（正體字）书写。"
        : `You are a cautious, concise psychological support session note assistant. Write in ${replyLanguageName(language)}.`;
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
        // A short note must not inherit a thinking model from the chat default:
        // its reasoning can consume this entire budget before any note is written.
        apiModel: "deepseek-v4-flash",
        stream: false,
        maxTokens: 750
      })
    );

    const cleaned = cleanAssistantText(summary);
    if (!cleaned) throw new Error("empty_summary");
    return Response.json({ summary: cleaned });
  } catch {
    return Response.json({ error: "summary_unavailable", retryable: true }, { status: 503 });
  }
}
