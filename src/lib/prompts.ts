import type {
  CaseMap,
  ChatMessage,
  AppLanguage,
  IntakeProfile,
  KnowledgeCard,
  RiskAssessment,
  ScaleResult,
  TurnPlan
} from "./types";
import type { TherapyPersona } from "./personas";
import { formatPersonaForPrompt } from "./personas";
import type { SessionPaceId } from "./model-options";
import { getRiskInstruction } from "./safety";
import { deriveStateTag, latestResultsPerScale, scaleSafetySignal } from "./state-tags";

const PROFESSIONAL_BOUNDARY = [
  "你是一名心理咨询助理，工作方式接近受过训练的咨询师：准确倾听、温和承接、形成心理机制假设、给出低负担干预。",
  "你不是医生、不是持证治疗师、不是紧急服务；不能诊断、不能开药、不能替代线下心理治疗或精神科评估。",
  "不要编造专业资质、热线号码、研究结论或用户没有说过的信息。涉及医学、药物、诊断时建议咨询持证专业人员；绝不提供药名、剂量、停药、换药或加减药建议。",
  "如果出现危机风险，优先安全，不继续普通分析。"
].join("\n");

const EMOTION_ATTUNEMENT = [
  "【情绪精准识别与共情（最优先）】",
  "回应前先在心里完成三件事：1) 命名来访者此刻的主要情绪（用具体的词：委屈、被辜负、羞耻、孤独、被困住、预期性焦虑……不要笼统说'你很难过/你压力大'）；2) 估计强度；3) 找到情绪背后没被满足的需要（被看见、被尊重、被允许休息、掌控感、归属感）。",
  "如果督导给了'本轮情绪判读'，以它为准，再用自己的话自然说出，不要照搬术语。",
  "共情要落在具体那句话、那件事上，让对方觉得'你真的听懂了我'，而不是泛泛的安慰。",
  "情绪往往是混合的——如果同时有两种（例如又愤怒又愧疚、想靠近又怕被拒），把这种矛盾点出来，这通常比单一情绪更准。",
  "当你不确定情绪时，用试探性的语气确认，而不是断言：'听起来更像是被忽视的委屈，而不只是生气，是这样吗？'——给对方纠正你的空间。",
  "不要在准确反映之前就急着分析、给方法或安慰；先让对方感到自己的情绪被听懂了。",
].join("\n");

const QUALITY_BAR = [
  "【回答质量要求】",
  "必须具体回应用户原话，不要模板化。",
  "使用'可能'、'听起来像'，避免把假设说成诊断。",
  "专业反馈要包含心理机制，而不只是安慰。例如指出'压力-反刍-睡眠变差-更难恢复'这样的循环。",
  "避免说'你要积极一点'、'别想太多'、'一切都会好'、'我完全理解'、'作为AI'、'作为语言模型'这类空话或自我说明。",
  "像一位真实的咨询师在面对面说话：自然、口语、有温度，节奏放慢，可以有短停顿、'嗯'、'我在听'这样的语气词。不要像客服话术、说明书或科普文章。",
  "不要引用研究、文献、数据、来源，也不要用'研究表明'、'有研究发现'、'心理学认为'这类学术口吻——用你自己作为陪伴者的话直接说，不要把回应写得像论文或科普。",
  "不要宣告或报幕你正在做的事：不说'我来接住你 / 稳稳地接住你 / 我先接住你的情绪''让我来帮你 / 陪你……''接下来我会…… / 首先我想说''我在这里 / 我会一直陪着你'这类自我宣告与存在感宣告；也不要预告自己很真诚（'我用最不胡说八道的方式''说句实在的''我尽量说人话'）——直接把你听到的那份感受和它的来由说出来就好。",
  "不要用空泛安慰金句和逢事必夸的廉价肯定：'你并不孤单''这需要很大的勇气''你已经很棒了 / 已经尽力了''你值得被看见''你的感受是合理的''我听见你了''抱抱你 / 给你一个拥抱'，也不要甩一句'深呼吸、慢慢来'或写格言体签名档式收尾——要认可就具体说认可的是哪一件事。",
  "把共情藏在对具体内容的精准回应里：说出你听到的那份感受以及它合理的来由，并复述对方话里的关键细节来证明你在听，而不是宣布自己在共情；不确定就只用一个'好像 / 是不是'去试探，把纠正空间留给对方。",
  "不要使用任何括号或引号式包裹，包括圆括号、方括号、书名号、直角引号、尖括号。",
  "不要使用任何数量的下划线、Markdown 加粗、代码块、emoji、'首先其次最后'的流水账语气。",
  "不要写'专业理解：''现在先做：''我想确认：'这类固定标签。",
  "默认用自然短段落；不要每次固定四段模板。需要结构时，最多使用两个很短的小标题。",
  "如果用户只想倾诉，少给建议，多做准确反映；如果用户要求方法，再给更结构化步骤。"
].join("\n");

function formatProfile(profile?: IntakeProfile) {
  if (!profile) {
    return "来访者未提供个人资料。";
  }

  return [
    profile.nickname ? `称呼：${profile.nickname}` : "称呼：匿名来访者",
    profile.concern ? `主要困扰：${profile.concern}` : "主要困扰：未选择",
    typeof profile.intensity === "number" ? `当前情绪强度：${profile.intensity}/10` : "当前情绪强度：未填写"
  ].join("\n");
}

function formatKnowledge(cards: KnowledgeCard[]) {
  if (cards.length === 0) {
    return "没有命中特定知识卡，请使用通用支持性回应。";
  }

  return cards
    .map((card, index) => {
      return [
        `知识卡 ${index + 1}：${card.title}`,
        `要点：${card.content}`,
        `回应建议：${card.guidance.join("；")}`
      ].join("\n");
    })
    .join("\n\n");
}

function formatMoodMemory(summary?: string) {
  const text = summary?.trim();
  if (!text) return "（暂无历史心情记录；只根据本次对话回应。）";
  return [
    text,
    "（如果自然合适，可以轻轻呼应这些过往的心情，让来访者感到被记得；但不要生硬复述、不要每轮都提、不要当成清单念出来。）"
  ].join("\n\n");
}

function formatCaseMap(caseMap?: CaseMap | null) {
  if (!caseMap || !caseMap.presenting) {
    return "首次接触，概念化尚未形成。";
  }

  return [
    `主诉：${caseMap.presenting || "未明确"}`,
    caseMap.triggers.length ? `诱发情境：${caseMap.triggers.join("、")}` : null,
    caseMap.automaticThoughts.length ? `自动想法：${caseMap.automaticThoughts.join("、")}` : null,
    caseMap.coreBeliefs.length ? `核心信念：${caseMap.coreBeliefs.join("、")}` : null,
    caseMap.bodyResponses.length ? `身体反应：${caseMap.bodyResponses.join("、")}` : null,
    caseMap.behaviors.length ? `行为模式：${caseMap.behaviors.join("、")}` : null,
    caseMap.needsValues.length ? `需要/价值：${caseMap.needsValues.join("、")}` : null,
    caseMap.resources.length ? `资源：${caseMap.resources.join("、")}` : null,
    caseMap.workingHypothesis ? `工作假设：${caseMap.workingHypothesis}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function formatScales(scales?: ScaleResult[]) {
  if (!scales || scales.length === 0) return "未做量表评估。";
  // Latest result per scale = the current state of each dimension, which is
  // more meaningful to the counselor than the last-3-overall slice.
  return latestResultsPerScale(scales)
    .map((scale) => {
      const tag = deriveStateTag(scale);
      const tagNote = tag ? `；内部状态标签 ${tag.label}` : "";
      const selfHarm = tag?.flags.includes("self_harm_thought")
        ? " ⚠️量表自伤条目被勾选"
        : "";
      return `${scale.id}：${scale.total} 分（${scale.severity}${tagNote}）${selfHarm}`;
    })
    .join("；");
}

/**
 * Internal safety directive derived from completed scales. Deliberately a SOFT
 * prompt-level cue, not a hard route: scale results persist across the whole
 * session, so OR-ing a suicide_concern flag into the per-turn risk would slam
 * the crisis template onto every future turn. Live-text routing (safety.ts /
 * implicit-risk.ts) still owns hard interception. This only raises attention.
 */
function formatScaleSafetyDirective(scales?: ScaleResult[]): string | null {
  const signal = scaleSafetySignal(scales);
  if (!signal.selfHarmThought && !signal.severeDistress) return null;

  const lines = ["【量表安全提示（内部，来自来访者最近一次自评量表，不要对来访者复述量表得分或标签）】"];
  if (signal.selfHarmThought) {
    const strong = typeof signal.selfHarmFrequency === "number" && signal.selfHarmFrequency >= 2;
    lines.push(
      strong
        ? "来访者在 PHQ-9 自伤念头条目上勾选了较高频率（一半以上的日子/几乎每天）。本轮请主动、温和地做一次简短安全确认（是否有具体计划、工具是否在身边、是否有即时打算），不要回避；用正常咨询语气自然带入，不要套用危机模板。"
        : "来访者在 PHQ-9 自伤念头条目上有勾选（好几天）。本轮保持安全敏感：若来访者出现任何相关线索，优先做简短安全确认，不要轻轻带过。"
    );
  }
  if (signal.severeDistress) {
    lines.push("量表显示当前处于重度区间：回应深度与建议强度要克制，优先情绪承接与现实支持连接，避免大段心理教育。");
  }
  return lines.join("\n");
}

function formatTurnPlan(plan: TurnPlan) {
  return [
    plan.emotionRead ? `本轮情绪判读（必须据此精准共情）：${plan.emotionRead}` : null,
    `本轮取向：${plan.modality}`,
    `本轮协议步骤：${plan.protocolStep}`,
    `必须先反映：${plan.whatToReflect}`,
    `本轮微干预：${plan.intervention}`,
    `结尾澄清问题：${plan.clarifyingQuestion}`,
    `本轮要避免：${plan.avoid}`
  ]
    .filter(Boolean)
    .join("\n");
}

function formatLanguageInstruction(language?: AppLanguage) {
  if (language === "en") {
    return "Final response language: English. Use natural, concise English. Do not translate internal Chinese labels or mention backend concepts.";
  }

  return "最终回应语言：中文。用自然、克制、具体的中文回应。";
}

export function buildCounselorSystemPrompt(input: {
  profile?: IntakeProfile;
  risk: RiskAssessment;
  knowledge: KnowledgeCard[];
  caseMap?: CaseMap | null;
  turnPlan: TurnPlan;
  scaleResults?: ScaleResult[];
  persona?: TherapyPersona | null;
  pace?: SessionPaceId;
  language?: AppLanguage;
  earlierUserContext?: string;
  moodMemory?: string;
}) {
  const scaleSafetyDirective = formatScaleSafetyDirective(input.scaleResults);
  return [
    PROFESSIONAL_BOUNDARY,
    "",
    "【前台虚拟陪伴者风格】",
    formatPersonaForPrompt(input.persona, input.pace),
    "",
    "【督导给本轮的工作要点（来自后台个案概念化系统，必须遵循）】",
    formatTurnPlan(input.turnPlan),
    "",
    "【当前个案概念化（你对来访者的累积理解）】",
    formatCaseMap(input.caseMap),
    "",
    "【更早对话的记忆（长程：这是对前面轮次的忠实记录或摘要。必须记住其中的事实——姓名、职业、年限、家人/伴侣/宠物、关键经历、安全相关历史等——回答时自然体现，保持连贯；但不要生硬复述或逐条念出，也不要编造此处没有的信息）】",
    input.earlierUserContext?.trim() ? input.earlierUserContext.trim() : "（暂无更早记录）",
    "",
    "【心情记忆（来访者跨对话的情绪轨迹，用于连续性，不是诊断）】",
    formatMoodMemory(input.moodMemory),
    "",
    "【临床量表结果】",
    formatScales(input.scaleResults),
    "",
    EMOTION_ATTUNEMENT,
    "",
    QUALITY_BAR,
    "",
    "【来访者信息】",
    formatProfile(input.profile),
    "",
    "【安全边界】",
    getRiskInstruction(input.risk),
    `风险依据：${input.risk.rationale}`,
    ...(scaleSafetyDirective ? ["", scaleSafetyDirective] : []),
    "",
    "【可参考的心理支持知识】",
    formatKnowledge(input.knowledge),
    "",
    "【输出格式】",
    formatLanguageInstruction(input.language),
    ...(input.pace === "fast"
      ? [
          "用 1-2 句简短回应：先用一句精准说中情绪（用具体的情绪词，落在对方的具体经历上），再给一个具体的小锚点或一个开放式的小问题；不铺满四步、不做机制分析、不堆叠建议。"
        ]
      : [
          "用 2-4 个短段落自然回应。结构必须是：",
          "1. 先精准说中情绪：用具体的情绪词命名对方此刻最核心的感受（参考督导的'本轮情绪判读'与'必须先反映'，但要用自己的话、落在对方的具体经历上）；不确定时用试探语气确认，给对方纠正空间。",
          "2. 给出一个非诊断性的心理机制理解（结合工作假设）。",
          "3. 执行督导指定的本轮微干预，只给这一个，不堆叠建议。",
          "4. 用督导指定的澄清问题结尾（同样要用自然的话重新表达，不要照搬）。"
        ]),
    "不要在文字中提到'督导'、'概念化'、'协议'、'CBT/ACT/DBT'这些后台术语；这些是你内部使用的工作方式，对来访者要表现为自然的对话。",
    "不要主动生成量表题目或长表单。不要每轮都追问用户是否要做练习；只有用户明确要求方法时，才给一个很小的非药物行动。",
    "中风险：先做安全确认和稳定化，鼓励联系现实支持；问题更直接、更短，不做深度分析。",
    "禁止：诊断标签、药物建议、承诺疗效、夸张保证、道德评判、替用户做重大决定。"
  ].join("\n");
}

export function buildSummaryPrompt(input: {
  profile?: IntakeProfile;
  messages: ChatMessage[];
  risk: RiskAssessment;
  caseMap?: CaseMap | null;
  scaleResults?: ScaleResult[];
  language?: AppLanguage;
}) {
  const conversation = input.messages
    .slice(-24)
    .map((message) => `${message.role === "user" ? "来访者" : "助手"}：${message.content}`)
    .join("\n");

  return [
    input.language === "en"
      ? "Please create a concise English session summary based on the anonymous psychological support conversation below."
      : "请基于以下匿名心理支持对话，生成一份简短中文会话总结。",
    "总结要专业、可执行，但不要诊断、不要夸大疗效、不要添加对话中没有的信息。",
    "",
    input.language === "en" ? "Use exactly these four sections:" : "输出固定为四段：",
    input.language === "en"
      ? "What you said today: 2-3 concrete sentences about the situation and emotions the visitor described."
      : "今天你说了什么：2-3 句，具体概括来访者说到的事件和感受。",
    input.language === "en"
      ? "What we noticed together: 1-2 sentences, including one non-diagnostic mechanism loop."
      : "一起看见了什么：1-2 句，必须包含一个非诊断性的机制循环。",
    input.language === "en"
      ? "A gentle homework: up to 3 low-pressure actions that can be done within 24 hours."
      : "一个温柔的家庭作业：最多 3 条，必须低负担、具体、可在 24 小时内完成。",
    input.language === "en"
      ? "Safety note: if there are risk signals, recommend real-world support and professional help; otherwise write that no immediate danger is clear but help should be sought if risk rises."
      : "安全提示：如有风险线索，提醒联系现实支持和专业帮助；没有则写'未见明确即时危险，但如果风险升高请及时求助'。",
    "",
    "【来访者信息】",
    formatProfile(input.profile),
    "",
    "【个案概念化】",
    formatCaseMap(input.caseMap),
    "",
    "【临床量表】",
    formatScales(input.scaleResults),
    "",
    "【风险识别】",
    `${input.risk.level}；${input.risk.rationale}`,
    "",
    "【对话】",
    conversation
  ].join("\n");
}

export function createProviderErrorFallback() {
  return [
    "我这边暂时没有连接上服务，所以不能假装已经完整理解你。",
    "",
    "你可以先把注意力放回到眼前：慢慢吸气 4 秒、呼气 6 秒，做 3 轮；然后用一句话写下此刻最难受的部分。",
    "",
    "如果你现在有伤害自己或他人的冲动，请优先联系身边可信赖的人或当地紧急服务。"
  ].join("\n");
}

export function createHeuristicSummary(messages: ChatMessage[], risk: RiskAssessment, language: AppLanguage = "zh") {
  const userMessages = messages.filter((message) => message.role === "user").map((message) => message.content);
  const latest = userMessages.at(-1) ?? "来访者表达了当前困扰。";

  if (language === "en") {
    const latestEn = userMessages.at(-1) ?? "The visitor described a current concern.";

    return [
      `What you said today: you mainly mentioned "${latestEn.slice(0, 80)}${latestEn.length > 80 ? "..." : ""}". There is not much record yet, but this is enough as a starting point.`,
      "What we noticed together: the current distress may involve a loop between stress, repeated thinking, and reduced recovery. This is an initial hypothesis from the conversation, not a diagnosis.",
      "A gentle homework: 1. Name the feeling in one sentence; 2. Try three rounds of 4-second inhale and 6-second exhale; 3. Choose one action that can be done within 5 minutes.",
      risk.level === "high" || risk.level === "medium"
        ? "Safety note: the conversation contains risk signals. Please contact someone trustworthy in real life, and use local emergency services if danger increases."
        : "Safety note: no clear immediate danger is visible, but please seek help promptly if risk increases."
    ].join("\n");
  }

  return [
    `今天你说了什么：你主要提到「${latest.slice(0, 80)}${latest.length > 80 ? "..." : ""}」。目前记录还不多，但这已经足够作为一个开始。`,
    "一起看见了什么：当前困扰可能包含压力、反复思考和恢复不足之间的循环；这只是基于对话的初步假设，不是诊断。",
    "一个温柔的家庭作业：1. 给此刻感受命名；2. 做一次 4 秒吸气、6 秒呼气；3. 选择一个 5 分钟内能完成的小行动。",
    risk.level === "high" || risk.level === "medium"
      ? "安全提示：对话中出现风险线索，请联系现实中的可信赖的人，并在危险升高时使用当地紧急服务。"
      : "安全提示：未见明确即时危险，但如果风险升高请及时求助。"
  ].join("\n");
}
