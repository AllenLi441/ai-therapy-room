import { buildKimiPayload, generateKimiText, isKimiConfigured } from "./kimi";
import type { ChatMessage, RiskAssessment, RiskCategory, RiskLevel } from "./types";

/**
 * 危机分类器 —— 临床安全护栏（Mental Health Guardrail）
 *
 * 临床原则：「有意过分诊（Intentional Over-triage）」
 * 在自杀风险评估中，漏诊（false negative）的代价是一条生命；
 * 误诊（false positive）的代价只是给一个不必要的来访者多看一张危机干预卡片。
 * 这两种代价是不对称的。因此，本分类器有意把阈值设得很低，宁可拦多了。
 *
 * 量表框架：Columbia Suicide Severity Rating Scale (C-SSRS) 的三项核心问题：
 *   - wish_to_be_dead           — 被动死亡愿望（"要是睡着不醒就好了"）
 *   - active_ideation_with_method — 主动意念 + 具体手段（"把药吃了"）
 *   - preparatory_behavior      — 准备行为（看着药盒/查说明书/写遗书/托付）
 *
 * 触发硬拦截（hardIntercept）的条件，命中任何一条即可：
 *   1. active_ideation_with_method = true
 *   2. preparatory_behavior = true
 *   3. risk_score ≥ 3（0–5 量表）
 *   4. self_harm = true 且为当前进行时
 *   5. harm_to_others = true 且伴随具体目标/手段
 */

const LEVEL_SCORE: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

const VALID_LEVELS: RiskLevel[] = ["none", "low", "medium", "high"];
const VALID_CATEGORIES: RiskCategory[] = [
  "self_harm",
  "suicide",
  "harm_to_others",
  "abuse",
  "psychosis",
  "panic",
  "medical"
];

export type LlmCrisisResult = {
  level: RiskLevel;
  categories: RiskCategory[];
  /** C-SSRS-aligned core fields (these drive the hard-intercept decision). */
  wish_to_be_dead: boolean;
  active_ideation_with_method: boolean;
  preparatory_behavior: boolean;
  /** 0–5 overall severity. ≥3 triggers hard intercept. */
  risk_score: number;
  /** Richer signals used for telemetry and downstream prompting; not for gating. */
  signals: {
    ideation: boolean;
    plan: boolean;
    means_access: boolean;
    research: boolean;
    isolation: boolean;
    imminence: boolean;
    self_harm: boolean;
    harm_to_others: boolean;
    abuse: boolean;
    psychosis: boolean;
    final_acts: boolean;
  };
  rationale: string;
  evidence: string[];
};

const CLASSIFIER_SYSTEM = [
  "你是一个临床级中文心理危机分类器，依据哥伦比亚自杀严重程度评定量表（C-SSRS）的临床框架对每一段心理咨询对话做风险评估。",
  "",
  "重要的临床原则：「有意过分诊（Intentional Over-triage）」。漏诊的代价是一条生命；误诊只是多推一张危机卡片。两者不对称——遇到模糊就报高。",
  "",
  "C-SSRS 三个核心维度（你必须分别判断）：",
  "1. wish_to_be_dead — 被动死亡愿望：来访者表达了希望自己不存在、消失、不再醒来、世界更好如果没我之类的内容。",
  "2. active_ideation_with_method — 主动意念 + 具体手段：来访者提到了一种可执行的致死或伤害方式（药、刀、跳、上吊、煤气、农药、勒、烫、撞……），哪怕没说'我要'两个字。例子：「要不把药吃了算了」「胃疼的药还有半盒」都是 true。",
  "3. preparatory_behavior — 准备行为（这是 C-SSRS 中最危险的一类）：来访者已经在做或者描述了任何朝向自伤的实际步骤。例子：",
  "   - 「看着药盒看了很久」「盯着刀」「站在阳台往下看」",
  "   - 「查了说明书」「算了一下剂量」「上网搜了怎么吃」",
  "   - 「写了一封信」「写好了遗书」「钥匙留在桌上」",
  "   - 「把猫托付给朋友」「把东西收拾好了」「该交代的都交代了」",
  "   - 「囤药」「攒药」「买好了」",
  "",
  "其他必判信号（影响 risk_score 和文字 level，不直接决定 hardIntercept）：",
  "- means_access：手段就在身边 / 触手可及（药就在桌上、刀就在床头）。",
  "- research：调查致死方式 / 查剂量 / 看说明书。",
  "- isolation：当下独处 / 没人能联系到 / 把自己关起来。",
  "- imminence：时间紧迫（今晚、马上、再过一会就）。",
  "- final_acts：告别行为（与 preparatory_behavior 高度重叠，但更偏「向他人交代」一面）。",
  "- self_harm：自伤已经发生或正在进行。",
  "- harm_to_others：明确目标 + 手段威胁伤害他人。",
  "- abuse：家暴 / 性侵 / 被虐待 / 人身被控制。",
  "- psychosis：幻听 / 妄想 / 被监视 / 思维插入。",
  "",
  "risk_score 评分规则（0–5）：",
  "- 0：完全无风险信号，普通生活困扰。",
  "- 1：弥漫性低落、压力大、焦虑，但无任何死亡或自伤暗示。",
  "- 2：被动死亡愿望（wish_to_be_dead），无方法、无准备。",
  "- 3：主动意念 + 模糊方法，或有 preparatory_behavior 任一项。",
  "- 4：active_ideation_with_method = true，或 preparatory_behavior 多项叠加。",
  "- 5：active_ideation_with_method + preparatory_behavior + (isolation 或 imminence)——即将发生。",
  "",
  "关键原则——语义判断，不是字面匹配：",
  "- 「要不把药吃了算了」即使没出现「自杀」二字，也是 active_ideation_with_method = true。",
  "- 「胃疼的药还有半盒」+ 上下文谈论结束生命 → active_ideation_with_method = true 且 means_access = true。",
  "- 「准备好了」如果上下文是讨论结束生命，是 imminence = true 而不是普通的「准备好旅行了」。",
  "",
  "输出严格 JSON，不要任何解释，不要 markdown 代码块：",
  '{"wish_to_be_dead": boolean, "active_ideation_with_method": boolean, "preparatory_behavior": boolean, "risk_score": 0-5, "level": "none|low|medium|high", "categories": ["..."], "signals": {"ideation": false, "plan": false, "means_access": false, "research": false, "isolation": false, "imminence": false, "self_harm": false, "harm_to_others": false, "abuse": false, "psychosis": false, "final_acts": false}, "rationale": "...", "evidence": ["..."]}'
].join("\n");

function formatConversation(messages: ChatMessage[]) {
  return messages
    .slice(-10)
    .map((message) => {
      const speaker = message.role === "user" ? "来访者" : "AI";
      return `${speaker}：${message.content.slice(0, 800)}`;
    })
    .join("\n");
}

function coerceLevel(value: unknown): RiskLevel {
  if (typeof value !== "string") return "none";
  const normalized = value.toLowerCase().trim();
  return (VALID_LEVELS.find((level) => level === normalized) ?? "none") as RiskLevel;
}

function coerceCategories(value: unknown): RiskCategory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<RiskCategory>();
  for (const item of value) {
    if (typeof item === "string") {
      const match = VALID_CATEGORIES.find((category) => category === item.toLowerCase().trim());
      if (match) seen.add(match);
    }
  }
  return [...seen];
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1";
  return false;
}

function coerceRiskScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(5, Math.max(0, Math.round(value)));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.min(5, Math.max(0, Math.round(parsed)));
  }
  return 0;
}

function coerceStrings(value: unknown, max = 3, maxLen = 120): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, max);
}

function parseClassifierOutput(raw: string): LlmCrisisResult | null {
  try {
    const trimmed = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const signalsRaw = (parsed.signals ?? {}) as Record<string, unknown>;

    return {
      level: coerceLevel(parsed.level),
      categories: coerceCategories(parsed.categories),
      wish_to_be_dead: coerceBoolean(parsed.wish_to_be_dead),
      active_ideation_with_method: coerceBoolean(parsed.active_ideation_with_method),
      preparatory_behavior: coerceBoolean(parsed.preparatory_behavior),
      risk_score: coerceRiskScore(parsed.risk_score),
      signals: {
        ideation: coerceBoolean(signalsRaw.ideation),
        plan: coerceBoolean(signalsRaw.plan),
        means_access: coerceBoolean(signalsRaw.means_access),
        research: coerceBoolean(signalsRaw.research),
        isolation: coerceBoolean(signalsRaw.isolation),
        imminence: coerceBoolean(signalsRaw.imminence),
        self_harm: coerceBoolean(signalsRaw.self_harm),
        harm_to_others: coerceBoolean(signalsRaw.harm_to_others),
        abuse: coerceBoolean(signalsRaw.abuse),
        psychosis: coerceBoolean(signalsRaw.psychosis),
        final_acts: coerceBoolean(signalsRaw.final_acts)
      },
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 160) : "",
      evidence: coerceStrings(parsed.evidence)
    };
  } catch {
    return null;
  }
}

/** Outcome of the LLM classifier call — distinguishes the three failure modes
 * we care about for the fail-safe policy. */
export type ClassifierOutcome =
  | { kind: "ok"; result: LlmCrisisResult }
  | { kind: "not_configured" } // no KIMI_API_KEY — dev mode, fall through
  | { kind: "error"; reason: string }; // configured but failed — fail-safe to crisis

export async function classifyCrisisWithLLM(
  messages: ChatMessage[],
  timeoutMs = 8_000
): Promise<ClassifierOutcome> {
  if (!isKimiConfigured()) {
    return { kind: "not_configured" };
  }

  const userTurns = messages.filter((message) => message.role === "user");
  if (userTurns.length === 0) {
    return { kind: "ok", result: emptyClassifierResult() };
  }

  const payload = buildKimiPayload({
    systemPrompt: CLASSIFIER_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          "请基于以下对话片段，对来访者当前的风险水平做 C-SSRS 框架的临床评估。",
          "只输出 JSON。任何模糊的情况，宁可报高。",
          "",
          "【对话】",
          formatConversation(messages)
        ].join("\n")
      }
    ],
    temperature: 0.1,
    maxTokens: 600,
    jsonMode: true
  });

  try {
    const raw = await generateKimiText(payload, timeoutMs);
    const parsed = parseClassifierOutput(raw);
    if (!parsed) {
      return { kind: "error", reason: "parse failed" };
    }
    return { kind: "ok", result: parsed };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return { kind: "error", reason };
  }
}

function emptyClassifierResult(): LlmCrisisResult {
  return {
    level: "none",
    categories: [],
    wish_to_be_dead: false,
    active_ideation_with_method: false,
    preparatory_behavior: false,
    risk_score: 0,
    signals: {
      ideation: false,
      plan: false,
      means_access: false,
      research: false,
      isolation: false,
      imminence: false,
      self_harm: false,
      harm_to_others: false,
      abuse: false,
      psychosis: false,
      final_acts: false
    },
    rationale: "",
    evidence: []
  };
}

/**
 * The hard-intercept rule. If this returns true, the chat endpoint MUST short-
 * circuit DeepSeek and return the static crisis-response template.
 *
 * Order matters — any single condition is enough.
 */
export function hardIntercept(result: LlmCrisisResult): boolean {
  if (result.active_ideation_with_method) return true;
  if (result.preparatory_behavior) return true;
  if (result.risk_score >= 3) return true;
  if (result.signals.self_harm) return true;
  if (result.signals.harm_to_others && (result.signals.means_access || result.signals.plan)) {
    return true;
  }
  return false;
}

/**
 * Decide whether to hard-intercept based on the classifier outcome AND the
 * lexicon assessment. The fail-safe policy:
 *
 *   - classifier OK + flagged → intercept
 *   - classifier OK + clean   → release (DeepSeek may run)
 *   - classifier ERROR (configured but failed) → intercept (the cost is one
 *     extra crisis card; the alternative is missing a real case)
 *   - classifier NOT_CONFIGURED → fall through to lexicon only (dev mode)
 *
 * The lexicon result is passed so we can also intercept on lexicon escalation
 * even when the classifier itself is silent.
 */
export function decideIntercept(
  outcome: ClassifierOutcome,
  lexicon: RiskAssessment
): { intercept: boolean; source: "lexicon" | "llm" | "fail_safe" | "none"; rationale: string } {
  if (lexicon.shouldEscalate) {
    return { intercept: true, source: "lexicon", rationale: lexicon.rationale };
  }

  if (outcome.kind === "ok") {
    if (hardIntercept(outcome.result)) {
      const parts = [
        outcome.result.active_ideation_with_method ? "主动意念+具体手段" : null,
        outcome.result.preparatory_behavior ? "准备行为" : null,
        outcome.result.risk_score >= 3 ? `risk_score=${outcome.result.risk_score}` : null,
        outcome.result.signals.self_harm ? "自伤进行时" : null
      ]
        .filter(Boolean)
        .join("、");
      return {
        intercept: true,
        source: "llm",
        rationale: `C-SSRS 硬触发：${parts}${outcome.result.rationale ? "。" + outcome.result.rationale : ""}`
      };
    }
    return { intercept: false, source: "none", rationale: outcome.result.rationale };
  }

  if (outcome.kind === "error") {
    // Classifier was supposed to run but failed (timeout / overload / parse).
    //
    // We *cannot* indiscriminately intercept here, or any Kimi outage turns
    // into a site-wide DoS where every message hits a crisis template.
    //
    // Compromise: fail-safe only when the lexicon has already flagged
    // something (level >= medium). On a truly clean message we trust the
    // lexicon's "none / low" verdict and let the conversation proceed.
    //
    // The lexicon catches all C-SSRS preparatory phrases directly, plus
    // explicit means + ideation. So the residual risk of releasing here is
    // limited to *semantically subtle* paraphrases that the lexicon misses
    // — and even those will be re-evaluated on the next turn by both the
    // lexicon (with new content) and a fresh LLM call.
    const interceptOnFailSafe = LEVEL_SCORE[lexicon.level] >= LEVEL_SCORE.medium;
    if (interceptOnFailSafe) {
      return {
        intercept: true,
        source: "fail_safe",
        rationale: `分类器错误，且 lexicon 已显示 ${lexicon.level} 信号，按高危处理：${outcome.reason}`
      };
    }
    return {
      intercept: false,
      source: "none",
      rationale: `分类器错误但 lexicon 干净，放行：${outcome.reason}`
    };
  }

  // not_configured — dev mode, no LLM available. Trust lexicon only.
  return { intercept: false, source: "none", rationale: "LLM 未配置，仅依赖词典" };
}

export function mergeWithLexicon(
  lexicon: RiskAssessment,
  outcome: ClassifierOutcome | null
): RiskAssessment {
  const result = outcome?.kind === "ok" ? outcome.result : null;
  if (!result) return lexicon;

  const winsByLevel = LEVEL_SCORE[result.level] > LEVEL_SCORE[lexicon.level];
  const level = winsByLevel ? result.level : lexicon.level;

  const categories = [...new Set([...lexicon.categories, ...result.categories])];

  const rationaleParts: string[] = [];
  if (lexicon.rationale) rationaleParts.push(lexicon.rationale);
  if (result.rationale) rationaleParts.push(`语义判断（LLM）：${result.rationale}`);
  if (result.evidence.length) {
    rationaleParts.push(`证据片段：${result.evidence.map((line) => `「${line}」`).join("；")}`);
  }

  return {
    level,
    categories,
    matchedTerms: lexicon.matchedTerms,
    flags: lexicon.flags,
    shouldEscalate: level === "high",
    rationale: rationaleParts.join("。 ")
  };
}
