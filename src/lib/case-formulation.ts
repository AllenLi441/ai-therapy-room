import { buildKimiPayload, generateKimiText, isKimiConfigured } from "./kimi";
import { formatPersonaForPrompt, type TherapyPersona } from "./personas";
import {
  crisisTurnPlan,
  defaultTurnPlan,
  diagnosisTurnPlan,
  medicationTurnPlan,
  suicideConcernTurnPlan
} from "./session-plan";
import {
  emptyCaseMap,
  type CaseMap,
  type ChatMessage,
  type ConsultGoal,
  type IntakeProfile,
  type RiskAssessment,
  type ScaleResult,
  type SessionPlan,
  type TherapyModality,
  type TurnPlan
} from "./types";

export { defaultTurnPlan, encodeSessionPlanHeader, decodeSessionPlanHeader } from "./session-plan";

const PLANNER_SYSTEM = [
  "你是一名中文心理咨询督导（不是聊天助手）。你的任务是基于完整对话上下文，维护一份持续更新的【个案概念化表】，并为下一轮回应制定一个简短、具体、可执行的【本轮计划】。",
  "",
  "你必须只输出严格 JSON，结构如下：",
  '{"case_map":{"presenting":"","triggers":[],"automatic_thoughts":[],"core_beliefs":[],"body_responses":[],"behaviors":[],"needs_values":[],"resources":[],"working_hypothesis":""},"turn_plan":{"modality":"person-centered|CBT|ACT|DBT|MI|trauma-informed|crisis","emotion_read":"","protocol_step":"","what_to_reflect":"","intervention":"","clarifying_question":"","avoid":""}}',
  "",
  "规则：",
  "1. 字段必须用中文，且只写从对话中实际推断到的内容；不要编造、不要重复用户原话堆叠。",
  "2. presenting：1 句话主诉。",
  "3. triggers / automatic_thoughts / core_beliefs / body_responses / behaviors / needs_values / resources：每项是 2-8 字短语，最多 5 条；推断不到就给空数组。",
  "4. core_beliefs 用非诊断语言（例如'我必须完美才有价值'，不要写'有自卑型人格'）。",
  "5. working_hypothesis：1-2 句机制假设，必须含一个循环（例如'压力→反刍→失眠→白天功能下降→更焦虑'）。",
  "6. modality 选择标准：高情绪唤醒/失控用 DBT；强烈认知反刍/灾难化用 CBT；纠结/卡住/价值缺失用 ACT；矛盾改变意愿用 MI；创伤相关用 trauma-informed；危机用 crisis；其余首选 person-centered。",
  "7. emotion_read：本轮最关键的字段，必须先做。用一句话精准命名来访者此刻的【主要情绪】+ 强度 + 背后的未满足需要。情绪词要具体、要分辨细微差别——是委屈不是愤怒、是被辜负的失望不是单纯难过、是羞耻不是内疚、是孤独不是无聊、是焦虑预期不是当下恐惧。如果同时有两种情绪（例如'又愤怒又愧疚'），都要点出来。格式示例：'主要情绪=被忽视的委屈（约7/10）；次要=对自己发火的愧疚；未满足的需要=被看见、被认可'。严禁写成'负面情绪'、'情绪低落'这种笼统词。",
  "8. protocol_step：本轮在所选取向下的具体步骤名（例如 'CBT-思维记录第 2 步：找证据'、'DBT-TIPP 降唤醒'、'ACT-解融合：把想法贴标签'）。",
  "9. what_to_reflect：本轮必须先准确反映的那个最核心的点（不超过 30 字），要与 emotion_read 一致。",
  "10. intervention：本轮要做的一个微干预（不超过 40 字，必须可执行、低负担）。",
  "11. clarifying_question：本轮最后要问的那个澄清问题（不超过 30 字，开放式、不评判）。",
  "12. avoid：本轮明确要避免的一件事（不超过 30 字，例如'不要急着给方法'、'不要追问创伤细节'）。",
  "13. 不要输出任何 JSON 之外的字符。不要使用 markdown 代码块。"
].join("\n");

function clampList(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function clampString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeModality(value: unknown): TherapyModality {
  const allowed: TherapyModality[] = [
    "person-centered",
    "CBT",
    "ACT",
    "DBT",
    "MI",
    "trauma-informed",
    "crisis"
  ];
  return (allowed.find((modality) => modality === value) ?? "person-centered") as TherapyModality;
}

function parsePlannerOutput(raw: string, fallbackCase: CaseMap): SessionPlan {
  let parsed: Record<string, unknown> | null = null;

  try {
    const trimmed = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return {
      caseMap: fallbackCase,
      turnPlan: defaultTurnPlan()
    };
  }

  const caseRaw = (parsed?.case_map ?? {}) as Record<string, unknown>;
  const planRaw = (parsed?.turn_plan ?? {}) as Record<string, unknown>;

  const caseMap: CaseMap = {
    presenting: clampString(caseRaw.presenting, 80) || fallbackCase.presenting,
    triggers: clampList(caseRaw.triggers),
    automaticThoughts: clampList(caseRaw.automatic_thoughts),
    coreBeliefs: clampList(caseRaw.core_beliefs),
    bodyResponses: clampList(caseRaw.body_responses),
    behaviors: clampList(caseRaw.behaviors),
    needsValues: clampList(caseRaw.needs_values),
    resources: clampList(caseRaw.resources),
    workingHypothesis: clampString(caseRaw.working_hypothesis, 240) || fallbackCase.workingHypothesis,
    updatedAt: new Date().toISOString()
  };

  const turnPlan: TurnPlan = {
    modality: normalizeModality(planRaw.modality),
    emotionRead: clampString(planRaw.emotion_read, 120),
    protocolStep: clampString(planRaw.protocol_step, 60),
    whatToReflect: clampString(planRaw.what_to_reflect, 60),
    intervention: clampString(planRaw.intervention, 80),
    clarifyingQuestion: clampString(planRaw.clarifying_question, 60),
    avoid: clampString(planRaw.avoid, 60)
  };

  return { caseMap, turnPlan };
}

function formatScales(results?: ScaleResult[]) {
  if (!results || results.length === 0) {
    return "无";
  }
  return results
    .slice(-4)
    .map((result) => `${result.id}=${result.total}（${result.severity}）`)
    .join("；");
}

function formatProfile(profile?: IntakeProfile) {
  if (!profile) return "无";
  return [
    profile.nickname ? `称呼：${profile.nickname}` : null,
    profile.concern ? `主诉：${profile.concern}` : null,
    typeof profile.intensity === "number" ? `情绪强度：${profile.intensity}/10` : null
  ]
    .filter(Boolean)
    .join("；") || "无";
}

function formatPriorCaseMap(map?: CaseMap | null) {
  if (!map) return "首轮，尚无概念化记录。";
  if (
    !map.presenting &&
    !map.workingHypothesis &&
    map.triggers.length === 0 &&
    map.automaticThoughts.length === 0
  ) {
    return "尚无概念化记录。";
  }

  return [
    `主诉：${map.presenting || "未知"}`,
    `诱发情境：${map.triggers.join("、") || "未知"}`,
    `自动想法：${map.automaticThoughts.join("、") || "未知"}`,
    `核心信念：${map.coreBeliefs.join("、") || "未知"}`,
    `身体反应：${map.bodyResponses.join("、") || "未知"}`,
    `行为：${map.behaviors.join("、") || "未知"}`,
    `需要/价值：${map.needsValues.join("、") || "未知"}`,
    `资源：${map.resources.join("、") || "未知"}`,
    `工作假设：${map.workingHypothesis || "未知"}`
  ].join("\n");
}

function formatConversation(messages: ChatMessage[]) {
  return messages
    .slice(-24)
    .map((message) => `${message.role === "user" ? "来访者" : "AI助手"}：${message.content}`)
    .join("\n");
}

const GOAL_LABEL: Record<ConsultGoal, string> = {
  listen: "先被听见——这一轮只倾听和反映，不给方法",
  mechanism: "找心理循环——帮来访者看清想法-情绪-行为的循环",
  exercise: "做一个练习——给一个具体、低负担的小练习",
  expression: "关系表达——帮来访者整理想对某人说的话"
};

export async function generateSessionPlan(input: {
  profile?: IntakeProfile;
  messages: ChatMessage[];
  priorCaseMap?: CaseMap | null;
  scaleResults?: ScaleResult[];
  risk: RiskAssessment;
  consultGoal?: ConsultGoal | null;
  persona?: TherapyPersona | null;
}): Promise<SessionPlan> {
  const fallbackCase = input.priorCaseMap ?? emptyCaseMap();

  if (input.risk.shouldEscalate) {
    return { caseMap: fallbackCase, turnPlan: crisisTurnPlan() };
  }

  if (input.risk.flags.includes("suicide_concern")) {
    return { caseMap: fallbackCase, turnPlan: suicideConcernTurnPlan() };
  }

  if (input.risk.flags.includes("medication_request")) {
    return { caseMap: fallbackCase, turnPlan: medicationTurnPlan() };
  }

  if (input.risk.flags.includes("diagnosis_request")) {
    return { caseMap: fallbackCase, turnPlan: diagnosisTurnPlan() };
  }

  if (!isKimiConfigured() || input.messages.length === 0) {
    return { caseMap: fallbackCase, turnPlan: defaultTurnPlan() };
  }

  const goalLine = input.consultGoal
    ? `来访者选择了本轮咨询目标：${GOAL_LABEL[input.consultGoal]}。请在制定计划时优先满足此目标。`
    : "来访者没有指定本轮目标，由你根据临床判断决定。";

  const userPrompt = [
    "【来访者基本信息】",
    formatProfile(input.profile),
    "",
    "【本轮咨询目标】",
    goalLine,
    "",
    "【前台虚拟陪伴者风格】",
    formatPersonaForPrompt(input.persona),
    "",
    "【已有概念化（可继承并修正）】",
    formatPriorCaseMap(input.priorCaseMap),
    "",
    "【最近量表结果】",
    formatScales(input.scaleResults),
    "",
    "【风险评估】",
    `${input.risk.level}；${input.risk.rationale}`,
    "",
    "【完整对话】",
    formatConversation(input.messages),
    "",
    "请基于以上内容，更新个案概念化并制定本轮计划。只输出 JSON。"
  ].join("\n");

  try {
    const raw = await generateKimiText(
      buildKimiPayload({
        systemPrompt: PLANNER_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.2,
        maxTokens: 900,
        jsonMode: true
      }),
      20_000
    );
    return parsePlannerOutput(raw, fallbackCase);
  } catch {
    return { caseMap: fallbackCase, turnPlan: defaultTurnPlan() };
  }
}
