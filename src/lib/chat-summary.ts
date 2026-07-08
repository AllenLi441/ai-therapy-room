import { buildDeepSeekPayload, generateDeepSeekText } from "./deepseek";
import type { AppLanguage } from "./types";

// Auto-compaction backstop for very long conversations. When history grows past the
// recent window, the route collapses the older portion into an AI-written memory and
// continues "fresh" with [memory + recent window] — seamless and invisible to the
// frontend (which keeps sending full history; the collapse happens server-side). This
// is the LLM upgrade to the free verbatim user-digest, and the route falls back to
// that digest on any failure/timeout so memory never fully breaks.

type Msg = { role: "user" | "assistant"; content: string };

const SUMMARY_SYSTEM_ZH = [
  "你是一段心理咨询对话的记忆压缩器。下面给你这段对话较早的部分（user＝来访者，assistant＝咨询师）。",
  "把它压缩成一段简洁、忠实的【对话记忆】，供咨询师在后续对话里保持连贯。如对话中出现，必须保留：",
  "- 来访者身份事实：称呼/姓名、年龄、职业与年限、家庭/伴侣/宠物等具体信息（姓名、数字要原样保留）；",
  "- 主诉与核心困扰、关键事件或经历、情绪走向；",
  "- 已经探讨/尝试过什么、当前焦点或仍未解决的点；",
  "- 任何安全相关历史（如曾经的低落、自伤或自杀念头及其当前状态）。",
  "要求：只基于对话里真实出现的信息，绝不编造或推测；第三人称客观记述；不超过 400 字；不要寒暄、不要逐字复述原话、不要给建议或评论。直接输出记忆正文，不要任何前后缀。"
].join("\n");

const SUMMARY_SYSTEM_EN = [
  "You compress the earlier part of a counseling conversation into memory (user = client, assistant = counselor).",
  "Produce a concise, faithful CONVERSATION MEMORY so the counselor stays consistent later. If present, you MUST keep:",
  "- client identity facts: name/how they are addressed, age, job & years, family/partner/pets and other specifics (keep names and numbers verbatim);",
  "- the presenting concern, key events/disclosures, and the emotional arc;",
  "- what has been explored/tried, the current focus, and open threads;",
  "- any safety-relevant history (past low mood, self-harm or suicidal thoughts and their current status).",
  "Rules: use only what actually appears; never invent or infer; third person, objective; under 350 words; no greetings, no verbatim quoting, no advice. Output the memory body only."
].join("\n");

export async function summarizeOlderConversation(older: Msg[], language: AppLanguage): Promise<string> {
  if (!older.length) return "";
  const payload = buildDeepSeekPayload({
    systemPrompt: language === "en" ? SUMMARY_SYSTEM_EN : SUMMARY_SYSTEM_ZH,
    messages: older,
    model: "deepseek-v4-flash", // fast + cheap; summarization doesn't need the pro tier
    stream: false,
    maxTokens: 700
  });
  return (await generateDeepSeekText(payload)).trim();
}
