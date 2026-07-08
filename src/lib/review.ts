import { buildKimiPayload, generateKimiText, isKimiConfigured } from "./kimi";
import type { TherapyPersona } from "./personas";
import type { CaseMap, MentalState, RiskAssessment, TurnPlan } from "./types";

export type ReviewResult = {
  approved: boolean;
  revisedResponse: string | null;
  issues: string[];
};

const REVIEWER_SYSTEM = [
  "你是一位中文心理咨询督导，负责审校 AI 咨询助理的每一条回复。你不直接和来访者对话。",
  "",
  "审查标准：",
  "1. AI腔：有没有说'作为AI'、'作为语言模型'、使用括号标注、下划线填空、emoji、书名号式标题。",
  "2. 建议过多：一条回复里有没有给了 2 个以上建议/练习/步骤。专业做法是每轮只做一个微干预。",
  "3. 诊断倾向：有没有使用诊断标签（如'你可能有抑郁症'、'这是焦虑障碍'），或给药物建议。",
  "4. 模板感：有没有'专业理解：''现在先做：''我想确认：'这类固定小标题，或'首先…其次…最后…'流水账。",
  "5. 风险遗漏：来访者有危机信号但回复仍在做普通分析，没有安全分流。",
  "6. 脱离原话：回复是否有具体回应用户说的话，还是泛泛而谈。",
  "7. 违背本轮计划：回复是否遵循了督导指定的取向和微干预。",
  "",
  "输出严格 JSON，不要有任何其他字符：",
  '{"approved": true/false, "issues": ["问题1","问题2"], "revised_response": "修正后的完整回复文本，如果 approved=true 则为 null"}',
  "",
  "如果 approved=false，你必须在 revised_response 中给出修正后的完整回复，遵循以下规则：",
  "- 保留原回复中好的部分，只修正有问题的部分",
  "- 修正后回复必须满足所有审查标准",
  "- 保持 2-4 个短段落的自然对话风格",
  "- 不要提到你是审校者、不要解释修改原因",
  "- 修正后的文本直接就是给来访者看的最终回复"
].join("\n");

function buildReviewPrompt(input: {
  draftResponse: string;
  lastUserMessage: string;
  turnPlan: TurnPlan;
  caseMap: CaseMap;
  risk: RiskAssessment;
}) {
  return [
    "【来访者最后一条消息】",
    input.lastUserMessage,
    "",
    "【本轮治疗计划】",
    `取向：${input.turnPlan.modality}`,
    `协议步骤：${input.turnPlan.protocolStep}`,
    `必须反映：${input.turnPlan.whatToReflect}`,
    `微干预：${input.turnPlan.intervention}`,
    `澄清问题：${input.turnPlan.clarifyingQuestion}`,
    `要避免：${input.turnPlan.avoid}`,
    "",
    "【个案工作假设】",
    input.caseMap.workingHypothesis || "尚未形成",
    "",
    "【风险等级】",
    `${input.risk.level}；${input.risk.rationale}`,
    "",
    "【待审校的 AI 回复】",
    input.draftResponse,
    "",
    "请审校并输出 JSON。"
  ].join("\n");
}

function parseReviewOutput(raw: string): ReviewResult {
  try {
    const trimmed = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;

    const approved = parsed.approved === true;
    const issues = Array.isArray(parsed.issues)
      ? (parsed.issues as unknown[]).filter((item): item is string => typeof item === "string").slice(0, 7)
      : [];
    const revisedResponse =
      typeof parsed.revised_response === "string" && parsed.revised_response.trim()
        ? parsed.revised_response.trim()
        : null;

    return { approved, revisedResponse: approved ? null : revisedResponse, issues };
  } catch {
    return { approved: true, revisedResponse: null, issues: [] };
  }
}

export async function reviewResponse(input: {
  draftResponse: string;
  lastUserMessage: string;
  turnPlan: TurnPlan;
  caseMap: CaseMap;
  risk: RiskAssessment;
  mentalState?: MentalState | null;
  persona?: TherapyPersona;
}): Promise<ReviewResult> {
  if (!isKimiConfigured()) {
    return { approved: true, revisedResponse: null, issues: [] };
  }

  if (!input.draftResponse.trim()) {
    return { approved: true, revisedResponse: null, issues: [] };
  }

  try {
    const raw = await generateKimiText(
      buildKimiPayload({
        systemPrompt: REVIEWER_SYSTEM,
        messages: [
          { role: "user", content: buildReviewPrompt(input) }
        ],
        temperature: 0.1,
        maxTokens: 1200,
        jsonMode: true
      }),
      15_000
    );

    return parseReviewOutput(raw);
  } catch {
    return { approved: true, revisedResponse: null, issues: [] };
  }
}
