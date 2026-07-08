import type {
  AppLanguage,
  ChatMessage,
  DangerLevel,
  RiskAssessment,
  RiskCategory,
  RiskFlag,
  RiskLevel
} from "./types";
import { CN_PRIMARY_HOTLINES, CN_SUPPLEMENTAL, INTL_RESOURCES, type CrisisHotline } from "./crisis-resources";

// Crisis hotline numbers, read from the SSOT (crisis-resources.ts) so these
// server-side templates can never drift from the UI CrisisSheet. Every value below
// is byte-identical to the previously-hardcoded literal — behavior-preserving.
function cnHotline(id: CrisisHotline["id"]): string {
  const hit = CN_PRIMARY_HOTLINES.find((h) => h.id === id);
  if (!hit) throw new Error(`crisis-resources: missing hotline ${id}`);
  return hit.number;
}
const PSYCH = cnHotline("psych");      // 12356
const POLICE = cnHotline("police");    // 110
const MEDICAL = cnHotline("medical");  // 120
const CN_EMS = `${POLICE}/${MEDICAL}`; // 110/120

type RiskRule = {
  category: RiskCategory;
  level: RiskLevel;
  terms: string[];
  flags?: RiskFlag[];
};

const HIGH_RISK_RULES: RiskRule[] = [
  {
    category: "suicide",
    level: "high",
    terms: [
      "自杀",
      "轻生",
      "结束生命",
      "不想活了",
      "不想再活",
      "不想活着",
      "不想活下去",
      "活不下去",
      "想死",
      "死了算了",
      "结束这一切",
      "去死算了",
      "跳楼",
      "上吊",
      "吞药",
      "吞安眠药",
      "把药吃了",
      "药吃了算了",
      "吃药算了",
      "吃多了会出事",
      "喝农药",
      "烧炭",
      "开煤气",
      "割腕",
      "遗书",
      "写遗书",
      "交代后事",
      "告别了",
      // Past-attempt disclosure — patient sharing they've previously
      // attempted suicide via overdose. Critical: lexicon used to route
      // these to medication_boundary because "安眠药" matched the
      // medication-request rules; that misclassification is a real
      // safety bug. These exact phrases now escalate to HIGH suicide.
      "吃了一整瓶",
      "吃了半瓶",
      "吃了大半瓶",
      "吃了快一整瓶",
      "吞了一整瓶",
      "吞了半瓶",
      "吞了大半瓶",
      "服了一整瓶",
      "服了半瓶",
      "曾经尝试自杀",
      "试过自杀",
      "自杀未遂",
      "上次自杀",
      "之前自杀",
      "上次没成功",
      "kill myself",
      "suicide",
      "end my life",
      "take my life",
      "want to die",
      "jump off",
      "hang myself",
      "overdose",
      "write a suicide note",
      "goodbye forever",
      "suicide attempt",
      "previous attempt"
    ]
  },
  {
    category: "self_harm",
    level: "high",
    terms: [
      "伤害自己",
      "自残",
      "割自己",
      "划自己",
      "撞墙",
      "用刀划",
      "控制不住想伤害自己",
      "hurt myself",
      "cut myself",
      "harm myself"
    ]
  },
  {
    category: "harm_to_others",
    level: "high",
    terms: ["杀了他", "杀了她", "杀人", "报复他们", "伤害别人", "拿刀", "想捅", "想砍"]
  },
  {
    category: "abuse",
    level: "high",
    terms: ["家暴", "被打", "被性侵", "被强奸", "被虐待", "被跟踪", "人身危险"]
  }
];

const MEDIUM_RISK_RULES: RiskRule[] = [
  {
    category: "suicide",
    level: "medium",
    flags: ["suicide_concern"],
    terms: [
      "消失就好了",
      "没有活着的意义",
      "不想醒来",
      "不想再醒",
      "再也不用醒来",
      "睡过去就好了",
      "永远睡着",
      "希望自己不存在",
      "如果我不在了",
      "从世界上消失",
      "大家没有我会更好",
      "没有我会更好",
      "大家会轻松一点",
      "我是负担",
      "拖累别人",
      "死掉会更好",
      "不如没来过",
      "一了百了",
      "没有必要继续",
      "没什么可留恋",
      "撑不下去",
      "撑不住了",
      "活着好累",
      "活着没意思",
      "活着没什么意思",
      "睡着不再醒来",
      "不再醒来",
      "看着药盒",
      // Hypothetical-self-disguise patterns. The "I'm asking for a friend"
      // / "假如有个人" framing is a well-documented self-disclosure tactic
      // in the suicide-risk literature; W1 manual explicitly says identify
      // as pragmatic=self. We catch the high-frequency Chinese variants
      // here at the lexicon layer so the LLM can't be tricked by trailing
      // hedges like "我只是好奇" or "纯学术问题".
      "假如有个人觉得活着",
      "假如有人觉得活着",
      "如果有个人觉得活着",
      "如果有人觉得活着",
      "假设有人觉得活着",
      "假如一个人觉得自己活着",
      "假如有个人想自杀",
      "假如有人想结束",
      "如果有人想结束",
      "i do not want to wake up",
      "i don't want to wake up",
      "not wake up",
      "wish i could disappear",
      "if i disappeared",
      "if i was gone",
      "better off without me",
      "everyone would be better without me",
      "no reason to live",
      "life is not worth living",
      "i am a burden",
      "i can't keep going",
      "i cannot keep going"
    ]
  },
  {
    category: "psychosis",
    level: "medium",
    terms: ["幻听", "幻觉", "有人监视我", "有人控制我", "脑子被控制", "听到声音命令"]
  },
  {
    category: "panic",
    level: "medium",
    terms: ["喘不过气", "心脏要爆炸", "快要死了", "惊恐发作", "濒死感"]
  },
  {
    category: "medical",
    level: "medium",
    terms: ["停药", "加药", "药量", "诊断", "躁狂", "精神病"]
  }
];

const MEDICATION_REQUEST_RULES: RiskRule[] = [
  {
    category: "medical",
    level: "medium",
    flags: ["medication_request"],
    terms: [
      "推荐什么药",
      "吃什么药",
      "该吃什么药",
      "用什么药",
      "买什么药",
      "开什么药",
      "推荐药",
      "药物推荐",
      "药名",
      "剂量",
      "药量",
      "开药",
      "吃药",
      "服药",
      "用药",
      "停药",
      "换药",
      "加药",
      "减药",
      "抗抑郁药",
      "抗焦虑药",
      "安眠药",
      "助眠药",
      "镇静药",
      "精神科药",
      "ssri",
      "snri",
      "苯二氮卓",
      "舍曲林",
      "氟西汀",
      "帕罗西汀",
      "文拉法辛",
      "度洛西汀",
      "艾司西酞普兰",
      "劳拉西泮",
      "阿普唑仑",
      "地西泮",
      "佐匹克隆",
      "唑吡坦",
      "思诺思",
      "曲唑酮",
      "褪黑素",
      "what medicine",
      "what medication",
      "which medicine",
      "which medication",
      "what drug",
      "what dose",
      "what dosage",
      "medicine should i take",
      "medication should i take",
      "dose should i take",
      "dosage should i take",
      "prescribe",
      "prescription",
      "antidepressant",
      "anti anxiety medication",
      "anti-anxiety medication",
      "sleeping pill",
      "sleep medication",
      "stop medication",
      "change medication",
      "increase medication",
      "reduce medication"
    ]
  }
];

const DIAGNOSIS_REQUEST_RULES: RiskRule[] = [
  {
    category: "medical",
    level: "medium",
    flags: ["diagnosis_request"],
    terms: [
      "我是不是抑郁症",
      "我是不是有抑郁症",
      "我有抑郁症吗",
      "我是抑郁症吗",
      "我是不是焦虑症",
      "我是不是有焦虑症",
      "我有焦虑症吗",
      "我是焦虑症吗",
      "我是不是双相",
      "我是不是躁郁症",
      "我是不是精神病",
      "帮我诊断",
      "给我诊断",
      "诊断一下",
      "能不能诊断",
      "确诊",
      "诊断为",
      "是不是病",
      "是不是心理疾病",
      "do i have depression",
      "am i depressed",
      "do i have anxiety",
      "do i have bipolar",
      "diagnose me",
      "diagnosis"
    ]
  }
];

const MEDICAL_RED_FLAG_RULES: RiskRule[] = [
  {
    category: "medical",
    level: "medium",
    flags: ["medical_red_flag"],
    terms: [
      "胸痛",
      "胸口痛",
      "胸闷",
      "昏厥",
      "晕倒",
      "意识模糊",
      "持续呼吸困难",
      "呼吸困难",
      "第一次发作",
      "首次发作",
      "心脏病",
      "心梗",
      "剧烈头痛",
      "一侧无力",
      "说话不清",
      "怀孕"
    ]
  }
];

const LOW_RISK_RULES: RiskRule[] = [
  {
    category: "panic",
    level: "low",
    terms: ["焦虑", "紧张", "压力大", "睡不着", "失眠", "害怕", "崩溃"]
  },
  {
    category: "self_harm",
    level: "low",
    terms: ["讨厌自己", "很没用", "自责", "撑着", "麻木"]
  }
];

const LEVEL_SCORE: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function collectMatches(text: string, rules: RiskRule[]) {
  const normalized = normalizeText(text);
  const matches: Array<{ category: RiskCategory; level: RiskLevel; term: string; flags?: RiskFlag[] }> = [];

  for (const rule of rules) {
    for (const term of rule.terms) {
      if (normalized.includes(normalizeText(term))) {
        matches.push({ category: rule.category, level: rule.level, term, flags: rule.flags });
      }
    }
  }

  return matches;
}

// §2 negation/idiom disambiguation (internal safety review 2026-06-16). The substring
// lexicon false-fires on benign 想死/自杀 usages — lone negation ("我不想死"), idioms
// ("想死你了"), rote ("死记硬背"), denials ("我没想过自杀"). Drop ONLY provably-benign
// occurrences; real ideation, ambivalence ("又想死又不想死"), the death-wish family
// ("不想活着"), and any OTHER risk term still fire. Conservative by design: when
// unsure, keep the match (over-triage), and the LLM judge backstops the rest.
// 想死 is benign ONLY as an idiom (想死你了), rote (死记硬背), or lone ADJACENT
// negation (不想死). We strip only those exact forms — NOT a fuzzy "negator nearby"
// window — so "控制不住想死" (a REAL crisis, where 不 belongs to 控制不住) still fires.
// A denial is [negator][optional intent verb][core], where the negator is bound to
// the core by AT MOST one intent verb. This deliberately does NOT match "控制不住想自杀"
// / "控制不住想死" (the 不 belongs to 控制不住, separated from the core by 住), nor
// "有自杀计划" (no negator) — those keep firing. It DOES catch "(从来)没(有)(想过)自杀"
// and "(从来)没(有)想死".
function stripDenials(text: string, core: string): string {
  const re = new RegExp(
    `(从来|从)?(没有|没|不|未|别)(想过|想要|想|有过|有|会|要|打算|过)?${core}`,
    "g"
  );
  return text.replace(re, "");
}
function hasRealXiangSi(normalized: string): boolean {
  const stripped = stripDenials(
    normalized
      .replace(/想死[你我他她它您们]+了?/g, "") // 想死你了 / 想死我了 hyperbole
      .replace(/想死记/g, ""),                  // 死记硬背 rote
    "想死"
  );
  return stripped.includes("想死");
}
function hasRealZiSha(normalized: string): boolean {
  return stripDenials(normalized, "自杀").includes("自杀");
}
function filterNegatedSuicide(
  text: string,
  matches: ReturnType<typeof collectMatches>
): ReturnType<typeof collectMatches> {
  const normalized = normalizeText(text);
  return matches.filter((m) => {
    if (m.term === "想死" || m.term === "想死了") return hasRealXiangSi(normalized);
    if (m.term === "自杀") return hasRealZiSha(normalized);
    return true;
  });
}

export function assessRisk(text: string): RiskAssessment {
  const matches = filterNegatedSuicide(text, [
    ...collectMatches(text, HIGH_RISK_RULES),
    ...collectMatches(text, MEDICATION_REQUEST_RULES),
    ...collectMatches(text, DIAGNOSIS_REQUEST_RULES),
    ...collectMatches(text, MEDICAL_RED_FLAG_RULES),
    ...collectMatches(text, MEDIUM_RISK_RULES),
    ...collectMatches(text, LOW_RISK_RULES)
  ]);

  const base: RiskAssessment =
    matches.length === 0
      ? {
          level: "none",
          categories: [],
          matchedTerms: [],
          flags: [],
          shouldEscalate: false,
          rationale: "未发现明显危机词或高风险表达。"
        }
      : (() => {
          const level = matches.reduce<RiskLevel>((current, match) => {
            return LEVEL_SCORE[match.level] > LEVEL_SCORE[current] ? match.level : current;
          }, "none");
          const categories = [...new Set(matches.map((m) => m.category))];
          const matchedTerms = [...new Set(matches.map((m) => m.term))];
          const flags = [...new Set(matches.flatMap((m) => m.flags ?? []))];
          return {
            level,
            categories,
            matchedTerms,
            flags,
            shouldEscalate: level === "high",
            rationale: `命中 ${level} 风险表达：${matchedTerms.slice(0, 5).join("、")}。`
          };
        })();

  // Apply the implicit accumulator on every assessRisk call, not just multi-
  // turn aggregation. This is the only way single-message implicit patterns
  // ("把朋友圈关了 + 把没说的都说了 + 心里挺平静" in one sentence) get caught.
  return augmentWithImplicitAccumulator(base, text);
}

export function createCrisisResponse(
  assessment: RiskAssessment,
  options?: { continuation?: boolean; language?: AppLanguage }
) {
  if (options?.language === "en") {
    const categoryHint = assessment.categories.includes("harm_to_others")
      ? "Your safety and other people's safety matter more than analyzing the reasons right now."
      : "Your safety matters more than finishing the story right now.";

    const opening = options?.continuation
      ? `We will stay in safety mode for now. ${categoryHint}`
      : `I am hearing a serious safety signal. ${categoryHint}`;

    return [
      opening,
      "",
      "Please do these first:",
      "1. If you already have a plan, a method nearby, or you worry you may lose control soon, call your local emergency number now, or ask someone nearby to call — the numbers in the support panel above are tappable.",
      "2. Try not to stay alone. Contact someone you trust in real life and say directly: I am not safe right now and need you to stay with me.",
      "3. Move anything you could use to hurt yourself or someone else out of reach, or ask someone else to hold it for you.",
      "4. If you can, put both feet on the floor. Inhale for 4 seconds and exhale for 6 seconds, five rounds."
    ].join("\n");
  }

  const categoryHint = assessment.categories.includes("harm_to_others")
    ? "你或他人的安全现在比继续分析原因更重要。"
    : "你的安全现在比把话说完整更重要。";

  const opening = options?.continuation
    ? `我们先继续停留在安全模式里。${categoryHint}`
    : `我听见这里有很强的危险信号。${categoryHint}`;

  return [
    opening,
    "",
    "请你先做这几件事：",
    "1. 如果你已经有明确计划、工具在身边，或担心自己马上会失控，请立刻拨打急救电话，或让身边的人帮你拨打——上方「紧急支持」里的号码都可以直接点按拨出。",
    "2. 现在尽量不要一个人待着。请马上联系一个现实中可信赖的人，直接说：我现在不安全，需要你陪我。",
    "3. 把可能伤害自己或他人的物品移到够不到的地方——请环顾一下周围，任何让你觉得不安全的东西，先拿开或请别人帮你保管。",
    "4. 如果可以，先把双脚踩在地面上，慢慢吸气 4 秒、呼气 6 秒，连续做 5 轮。",
    "5. 先做一个今晚的安全约定：在联系到现实中的人之前，不去碰那些可能伤害自己的东西。"
  ].join("\n");
}

export function createMedicalRedFlagResponse(language: AppLanguage = "zh") {
  if (language === "en") {
    return [
      "Put physical safety first. Symptoms such as chest pain, fainting, ongoing breathing difficulty, a first episode, heart history, slurred speech, or one-sided weakness should not be treated only as stress or panic.",
      "",
      "If these symptoms are happening now, feel intense, are not easing, or this is the first time, please contact local medical services or emergency help as soon as possible. If someone is nearby, ask them to stay with you and help you get care. A psychological support tool cannot judge whether this is a panic attack and cannot replace an in-person medical assessment.",
      "",
      "While you contact real-world help, sit down or lean against a wall, reduce walking around, and focus on a slow exhale. The priority is not analyzing why this happened. The priority is confirming your body is safe."
    ].join("\n");
  }

  return [
    "先把身体风险放在前面处理。你提到的胸痛、昏厥、持续呼吸困难、首次发作、心脏病史、说话不清或一侧无力这类信号，不能只按心理压力或惊恐来解释。",
    "",
    "如果这些症状正在发生、强度明显、持续不缓解，或这是第一次出现，请尽快联系当地医疗服务或急救电话；身边有人时，请直接让对方陪你一起处理。心理支持工具不能判断这是不是惊恐发作，也不能替代现场医疗评估。",
    "",
    "在联系现实帮助的同时，你可以先坐下或靠墙站稳，减少走动，把注意力放在慢慢呼气上。现在最重要的不是分析原因，而是确认身体安全。"
  ].join("\n");
}

export function createMedicationBoundaryResponse(language: AppLanguage = "zh") {
  if (language === "en") {
    return [
      "Wanting to know whether to take something or adjust it usually means you've been worn down by all this and are looking for something that actually helps — that makes sense, and I hear it.",
      "",
      "On the medication itself, I cannot recommend names or doses, and I cannot decide whether you should increase, reduce, stop, or switch medication.",
      "",
      "The safer next step is to organize your symptoms, how long they have lasted, sleep, appetite, any self-harm thoughts, previous medications, and side effects, then bring that to a psychiatrist or another licensed clinician. If you are already taking medication, do not stop, switch, or change the dose on your own — stopping suddenly can cause withdrawal or a rebound of symptoms, and any change should be tapered under a doctor's guidance.",
      "",
      "If you have severe allergy symptoms, confusion, chest pain, trouble breathing, seizures, or strong urges to harm yourself, contact emergency or in-person medical help promptly.",
      "",
      "I can help with two things that do not involve prescribing: preparing a symptom list for a medical visit, or looking at your current mood and sleep pattern together."
    ].join("\n");
  }

  return [
    "会想着要不要吃药、能不能调整，通常是你已经被这些状态折腾得挺累了，想找一个真正能缓解的办法，这份着急我接得住。",
    "",
    "只是关于用药，我不能给你推荐药名、剂量，也不能替你决定加药、减药、停药或换药。",
    "",
    "更稳妥的做法是把症状、持续时间、睡眠、食欲、是否有自伤想法、既往用药和副作用整理出来，带给精神科医生或其他持证医生评估。已经在服药的话，不要自行停药、换药或改剂量——突然停药可能引起不适或症状反弹，调整药物需要在医生指导下逐步进行。",
    "",
    "如果出现严重过敏、意识模糊、胸痛、呼吸困难、抽搐，或强烈自伤冲动，请及时联系急救或线下医疗帮助。",
    "",
    "我可以帮你做两件不涉及开药的事：整理就诊前要说的症状清单，或者先一起看现在的情绪和睡眠模式。"
  ].join("\n");
}

export function createDiagnosisBoundaryResponse(language: AppLanguage = "zh") {
  if (language === "en") {
    return [
      "Wanting to know whether something is wrong usually comes from a real place — things have felt off and you want to understand what's going on and whether it can get better. That's a very normal thing to want.",
      "",
      "I cannot diagnose you or confirm whether this is depression, anxiety, bipolar disorder, or another condition from a chat.",
      "",
      "A safer next step is to bring this to a psychiatrist, a psychological clinic, a school counselor, or another licensed clinician, especially if symptoms last more than two weeks, affect school/work/sleep, or include self-harm thoughts. You can tell them: how long this has lasted, sleep and appetite changes, concentration, energy, panic symptoms, medication or substance use, and any safety concerns.",
      "",
      "What I can do here is help you organize the symptoms and the situation, then decide what to ask a professional. If there is immediate danger or self-harm risk, contact emergency help or someone trustworthy nearby first."
    ].join("\n");
  }

  return [
    "想知道自己是不是病了，背后常常是这阵子真的很不对劲，你想弄清楚到底怎么了、还能不能好起来，想搞明白是很自然的。",
    "",
    "我不能在聊天里替你诊断，也不能确认你是不是抑郁症、焦虑症、双相或其他疾病。",
    "",
    "更稳妥的下一步，是把这个问题带到精神科、心理科、学校心理老师或其他持证专业人员那里评估。尤其是症状持续两周以上，已经影响学习、工作、睡眠，或出现自伤念头时，更应该尽快线下求助。你可以准备这些信息：持续多久、睡眠和食欲、注意力、精力、惊恐症状、既往用药或物质使用、有没有安全风险。",
    "",
    "我在这里可以帮你做的是：先把症状和发生情境整理清楚，帮你准备就诊时要说的内容。如果现在有即时危险或自伤冲动，请优先联系急救或现实中可信赖的人。"
  ].join("\n");
}

export function createSuicideConcernResponse(language: AppLanguage = "zh") {
  if (language === "en") {
    return [
      "I am going to take that seriously. It sounds like part of you may be thinking about disappearing, not waking up, or not having to keep living. We should not treat that as a normal venting line.",
      "",
      "Before analyzing why this feels so heavy, please check immediate safety first. If you have a plan, a method nearby, or you are worried you might act on it, contact emergency services now or ask someone nearby to stay with you. If there is no clear plan, please still do not carry this alone. Message someone you trust and say: I am not safe being alone with my thoughts tonight.",
    ].join("\n");
  }

  return [
    "这句话我会认真对待。它听起来不只是普通抱怨，而像是有一部分你在想消失、不醒来，或者不用继续活着。",
    "",
    "先不急着分析为什么这么痛，先确认眼前安全。如果你已经有计划、工具在身边，或者担心自己会控制不住，请现在就联系急救服务，或者让身边可信赖的人过来陪你。如果还没有明确计划，也不要一个人扛，给现实中可信赖的人发一句：我今晚不太安全，不想一个人待着。"
  ].join("\n");
}

// (createCrisisResourceBlock removed 2026-07-08 — owner directive: crisis replies no longer
// carry an appended in-text hotline block; hotlines live in the crisis banner / CrisisSheet /
// global footer UI. The 1–4 check-in is asked via the banner buttons only.)

export function createGlobalSafetyFooter(language: AppLanguage = "zh"): string {
  if (language === "en") {
    return `📞 If you are in danger or need immediate help, call your local emergency number (e.g. ${INTL_RESOURCES.usEmergency} US/Canada) or a crisis line (${INTL_RESOURCES.usCrisis} US · Samaritans ${INTL_RESOURCES.ukSamaritans} · ${INTL_RESOURCES.finder}), or reach someone you trust.`;
  }
  return `📞 如果你现在有危险或需要立即帮助，请拨打 ${CN_EMS} 或 ${PSYCH}，或联系身边可信赖的人。`;
}

export function getRiskInstruction(assessment: RiskAssessment) {
  if (assessment.level === "high") {
    // Crisis-generation guidance (③): the model writes a TAILORED reply to someone
    // who may be about to hurt themselves. The deterministic hotline block is
    // appended by the route, so the model need not list numbers itself.
    return [
      "高风险危机——你不是在做普通咨询，是在陪一个可能要伤害自己的人度过眼前几分钟：",
      "1. 先用一两句贴着对方刚说的话回应，具体说中此刻最重的那个感受（用对方的词，不要套话、不要复读模板）。",
      "2. 不分析原因、不讲机制、不堆建议、不追问过去。",
      "3. 温和把注意力引向「眼前安全」和「联系现实中的人」。",
      "4. 不评判、不说教、不承诺一切会好、不替对方做决定；保持短。",
      "5. 真实热线和安全步骤会由系统在你这段话后面自动附上，你不必自己列号码。"
    ].join("\n");
  }

  if (assessment.level === "medium") {
    if (assessment.flags.includes("suicide_concern")) {
      return "中风险自杀意念线索：不要普通反问，不做深度分析；先承认风险、做即时安全确认、鼓励联系现实支持，并用很短的选择题确认当前安全程度。";
    }

    if (assessment.flags.includes("medication_request")) {
      return "中风险药物问题：不要给药名、剂量、开药、停药、换药、加减剂量建议；先说明边界，建议联系精神科医生或其他持证医生，并可帮助用户整理就诊信息和非药物支持。";
    }

    if (assessment.flags.includes("diagnosis_request")) {
      return "中风险诊断请求：不要做诊断或确认疾病名称；先说明不能替代专业评估，主动建议精神科/心理科/学校心理老师等线下路径，并帮助整理就诊信息。";
    }

    if (assessment.flags.includes("medical_red_flag")) {
      return "中风险且有身体/医疗红旗：先保持短句稳定化，同时明确建议及时联系医疗服务；如果有胸痛、昏厥、持续呼吸困难、首次发作、心脏病史、说话不清或一侧无力，不要只按心理问题处理。";
    }

    if (assessment.categories.includes("panic")) {
      return "中风险惊恐/急性焦虑：保持短句、降唤醒和现实定向；不要直接诊断。需要询问医疗红旗：胸痛、昏厥、持续呼吸困难、首次发作、心脏病史、说话不清或一侧无力；如有则建议及时医疗求助。";
    }

    return "中风险：保持温和、短句、稳定化，鼓励联系现实支持和专业资源；不要诊断、不要承诺安全。";
  }

  if (assessment.level === "low") {
    return "低风险：可以继续支持性回应，同时留意安全并避免过度保证。";
  }

  return "未见明显风险：按支持性心理咨询风格回应。";
}

export function activateCrisisSessionRisk(assessment: RiskAssessment): RiskAssessment {
  const crisisFlag: RiskFlag = "crisis_session_active";

  return {
    ...assessment,
    level: "high",
    flags: [...new Set<RiskFlag>([...assessment.flags, crisisFlag])],
    shouldEscalate: true,
    rationale:
      assessment.level === "none"
        ? "危机会话模式仍在进行中，继续优先安全。"
        : `${assessment.rationale} 危机会话模式仍在进行中，继续优先安全。`
  };
}

/**
 * Implicit-suspicious phrases.
 *
 * Each phrase ALONE is ambiguous (could be a normal complaint about a
 * meeting, a normal goodbye letter, etc.). But when 2+ of these
 * accumulate in the same message — and especially when paired with
 * the existing low/medium signals — that's a strong implicit-risk
 * pattern that the LLM classifier should catch, but is also worth
 * catching at the lexicon layer for two reasons:
 *
 *   1. Defense-in-depth when Kimi is overloaded (the case where the
 *      LLM call errors and the fail-safe ladder otherwise releases).
 *   2. Lower latency: catch obvious accumulating patterns in ~0ms.
 */
const IMPLICIT_SUSPICIOUS_TERMS = [
  // Hopelessness / meaninglessness paraphrases
  "没什么意义",
  "一切都没意义",
  "一切都没什么意义",
  "感觉一切都没",
  "找不到意义",
  "看不到希望",
  "看不到未来",
  "不知道为什么还要",
  "为什么还要继续",
  "继续下去也没",
  "继续下去也是",
  "演别人的人生",
  "活成别人",
  "活成了别人",
  "活够了",
  "活不出",
  // Burdensomeness without "我是负担"
  "添麻烦",
  "拖累家人",
  "成了累赘",
  "他们会过得轻松",
  "她应该会轻松",
  "应该会轻松一点",
  "对大家都好",
  "对他们都好",
  // Farewell behaviors
  "把朋友圈关了",
  "把账号都注销",
  "把没说的都说了",
  "把想说的都说了",
  "把该说的都说了",
  "该交代的都交代",
  "想说的都说",
  "把东西收拾好",
  "把猫送给",
  "把狗送给",
  "猫托付",
  "狗托付",
  "送给闺蜜",
  "送给最好",
  "钥匙留在",
  "密码告诉",
  // Calm-before-storm closure cues
  "心里挺平静",
  "心里前所未有的平静",
  "终于平静了",
  "想清楚了",
  "想明白了",
  "比之前轻松很多",
  "比之前都轻松",
  // Means stockpiling + readiness
  "攒了药",
  "囤了药",
  "存了药",
  "买好了药",
  "买好了炭",
  "藏了刀",
  "整瓶安眠药",
  "一整瓶药",
  // "Ready-ness" cues — by themselves benign, but combined with any other
  // implicit cue indicate the user has internally crossed an action threshold.
  "准备好了",
  "都准备好",
  "已经准备好",
  "家里药",
  "家里有药",
  "我家有",
  // Capability access
  "药就在",
  "刀就在",
  "绳就在",
  // Code-switched / 拼音 / English fragments commonly used in zh chat
  "want to disappear",
  "want to die",
  "tired of living",
  "wo bu xiang huo",
  "buxiang huo",
  "bu xiang huo",
  // Emoji-coded
  "🪦",
  "⚰️",
  "💊+", // not literal, but as a hint substring "💊+" e.g. "💊+酒"
  "🌌见",
  // Isolation (when paired with anything else, accumulator triggers)
  "今晚一个人",
  "今晚没人",
  "今晚就我",
  "他们今晚都不在",
  "今晚都不在家",
  "都不在家",
  "家里没人",
  "一个人在家",
  "把门锁",
  // Imminence
  "今晚就",
  "今夜",
  "马上就要",
  "马上就",
  "等会就",
  "再过一会"
];

/** fast 并行路径的前闸:文本是否命中任何一条隐晦风险短语(≥1 即视为"不干净",
 *  该轮降级为阻塞判官)。词表复用 IMPLICIT_SUSPICIOUS_TERMS,不新增词条。 */
export function hasImplicitSuspicion(text: string): boolean {
  const normalized = normalizeText(text);
  return IMPLICIT_SUSPICIOUS_TERMS.some((term) => normalized.includes(normalizeText(term)));
}

/**
 * Multi-turn / cumulative lexicon risk.
 *
 * Why this exists (PDF eval gradient case):
 *   Turn 1 "我看着药盒看了很久" → medium (suicide_concern)
 *   Turn 2 "胃疼的药还有半盒" → looks benign in isolation
 *   Turn 3 "今晚没人在家" → looks benign in isolation
 *   Each turn alone may pass through; combined they are C-SSRS
 *   plan_preparation + means_capability + isolation.
 *
 * assessConversationRisk aggregates signals across the last 4 user
 * messages so the system can see the gradient that the single-message
 * assessRisk cannot.
 *
 * The returned assessment is the maximum of:
 *   - assessRisk(latestUserMessage) — single-turn baseline
 *   - assessRisk(concatLast4UserMessages) — cumulative
 * with a rationale that flags the multi-turn origin when relevant.
 */
const LEVEL_SCORE_LOCAL: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

export function assessConversationRisk(messages: ChatMessage[]): RiskAssessment {
  const userTurns = messages.filter((m) => m.role === "user");
  if (userTurns.length === 0) return assessRisk("");

  const lastUser = userTurns[userTurns.length - 1];
  // assessRisk already applies the implicit accumulator internally, so the
  // returned single-turn assessment is the full single-turn analysis.
  const singleTurn = assessRisk(lastUser.content);

  if (userTurns.length === 1) return singleTurn;

  const recent = userTurns.slice(-4);
  const combinedText = recent.map((m) => m.content).join("\n");
  const cumulative = assessRisk(combinedText);

  // Decide whether to use cumulative. Two reasons to prefer it:
  //   - Higher level (gradient is detected only across turns), OR
  //   - Same level, but more matched terms — meaning earlier turns added
  //     signals that the latest turn alone doesn't show.
  const higherLevel =
    LEVEL_SCORE_LOCAL[cumulative.level] > LEVEL_SCORE_LOCAL[singleTurn.level];
  const moreTerms =
    LEVEL_SCORE_LOCAL[cumulative.level] === LEVEL_SCORE_LOCAL[singleTurn.level] &&
    cumulative.matchedTerms.length > singleTurn.matchedTerms.length;

  if (!higherLevel && !moreTerms) return singleTurn;

  return {
    ...cumulative,
    rationale: `跨多轮累积信号（最近 ${recent.length} 条用户消息）：${cumulative.rationale}`
  };
}

/**
 * Apply the implicit-suspicious accumulator. 2+ matches → suicide_concern
 * flag added, level bumped to at least medium. The lexicon's other
 * categories/flags are preserved.
 */
function augmentWithImplicitAccumulator(base: RiskAssessment, text: string): RiskAssessment {
  const normalized = normalizeText(text);
  const matches = IMPLICIT_SUSPICIOUS_TERMS.filter((term) =>
    normalized.includes(normalizeText(term))
  );
  if (matches.length === 0) return base;

  // Escalation rules (over-triage, but calibrated to not double-count what
  // the base lexicon already catches):
  //
  // - 1 implicit phrase alone → no escalation
  //   (a single ambiguous phrase like "没什么意义" could be a meeting complaint.)
  // - 2 implicit phrases → at least MEDIUM with suicide_concern
  //   (the combination of two cues — e.g. hopelessness + farewell — is
  //   itself reason to treat as a suicide concern.)
  // - 3+ implicit phrases → HIGH
  //   (this is itself a strong C-SSRS preparatory pattern.)
  //
  // We deliberately do NOT auto-escalate "base medium-with-suicide-concern +
  // 1 implicit phrase" to high. A single base lexicon hit (e.g. "如果我不在了")
  // paired with a single implicit modifier (e.g. "应该会轻松一点") is the
  // textbook passive-death-wish + burdensomeness pattern → medium, not
  // crisis-level. The static suicide_concern template is the right response,
  // and bumping to crisis would be over-aggressive on a clinical interview.
  if (matches.length < 2) return base;

  const flags = new Set<RiskFlag>(base.flags);
  flags.add("suicide_concern");
  const categories = new Set<RiskCategory>(base.categories);
  categories.add("suicide");

  const baseAlreadyConcerned =
    base.flags.includes("suicide_concern") ||
    LEVEL_SCORE_LOCAL[base.level] >= LEVEL_SCORE_LOCAL.medium;

  let level: RiskLevel = base.level;
  if (LEVEL_SCORE_LOCAL.medium > LEVEL_SCORE_LOCAL[level]) {
    level = "medium";
  }
  // High threshold:
  //   - 3+ implicit phrases alone, OR
  //   - 2+ implicit phrases when the base lexicon already established
  //     a suicide-concern context (passive ideation + multiple additional
  //     cues like isolation, farewell, means → C-SSRS preparation pattern).
  const shouldGoHigh = matches.length >= 3 || (matches.length >= 2 && baseAlreadyConcerned);
  if (shouldGoHigh && LEVEL_SCORE_LOCAL.high > LEVEL_SCORE_LOCAL[level]) {
    level = "high";
  }

  const newTerms = [...new Set([...base.matchedTerms, ...matches])];
  const accumulatorNote = `命中 ${matches.length} 条隐晦风险短语：${matches.slice(0, 5).join("、")}`;

  return {
    ...base,
    level,
    flags: [...flags],
    categories: [...categories],
    matchedTerms: newTerms,
    shouldEscalate: level === "high",
    rationale: base.rationale === "未发现明显危机词或高风险表达。"
      ? accumulatorNote
      : `${base.rationale} ${accumulatorNote}`
  };
}

/**
 * Backend-inferred crisis-mode detection from conversation history.
 *
 * Why this exists:
 *   The frontend passes crisisModeActive=true when it knows the session
 *   should stay in safety mode. But if the frontend state is lost
 *   (page refresh on a mobile browser, server restart between turns,
 *   third-party API client), the backend should still recognize that
 *   we *just sent* a crisis template a turn or two ago and keep the
 *   session in safety mode.
 *
 * The check is conservative: it only LOOKS for activation, not
 * deactivation. Releasing crisis mode is an explicit operation
 * (server-rendered safety check + explicit user safety confirmation),
 * not something we want to fall out of by accident.
 */
const CRISIS_RESPONSE_MARKERS = [
  // Phrases that ONLY appear in our crisis / suicide-concern templates.
  "我听见这里有很强的危险信号",
  "我们先继续停留在安全模式",
  "这句话我会认真对待",
  "If you have a plan, a method nearby"
];
// NOTE: bare hotline numbers (12356 / 010-… / 400-…) were removed from the markers
// on purpose — a normal safety-toned reply that mentions a hotline must NOT count as
// "we just sent the full crisis template", or crisis mode could never exit.

// Clear, first-person "I'm safe / I've calmed down" affirmations (normalized form:
// lowercased, whitespace + apostrophes stripped — see normalizeText). A bare "1"
// (crisis-action ack = "I moved items away") is intentionally NOT here: that is a
// safety STEP, not "I'm out of danger", so it must keep crisis mode on.
const CRISIS_DEESCALATION_PHRASES = [
  "我现在安全",
  "我安全了",
  "现在安全了",
  "我没事了",
  "我好多了",
  "好多了",
  "我缓过来了",
  "缓过来了",
  "冷静下来了",
  "平静下来了",
  "平复了",
  "iamsafenow",
  "imsafenow",
  "iamokaynow",
  "imokaynow",
  "imoknow",
  "ifeelbetternow",
  "ifeelsafenow",
  "ifeelcalmernow",
  "feelingbetternow"
];

export function detectActiveCrisisFromHistory(messages: ChatMessage[]): {
  active: boolean;
  deescalated: boolean;
  reason: string;
} {
  const recentAssistant = messages.filter((m) => m.role === "assistant").slice(-4);
  const recentUser = messages.filter((m) => m.role === "user").slice(-3);

  const recentlySentCrisis = recentAssistant.some((m) =>
    CRISIS_RESPONSE_MARKERS.some((marker) => m.content.includes(marker))
  );

  if (!recentlySentCrisis) {
    return { active: false, deescalated: false, reason: "无近期危机回复历史" };
  }

  const lastUserContent = recentUser[recentUser.length - 1]?.content?.trim() ?? "";
  const lastNormalized = normalizeText(lastUserContent);
  const safetyAck = /^1[\s\.。、]?(我|已经)?|^我已经移开|^已经移开|^安全了/.test(lastUserContent);

  // Conservative de-escalation: the user gives a CLEAR safety affirmation (not just
  // the crisis-action ack "1") AND shows no hard self-harm / suicide core in the
  // same turn. This lets the user leave safety mode by saying they're safe instead
  // of only by clearing the conversation. `deescalated` overrides the frontend's
  // (sticky) crisisModeActive flag at the call sites. Any new hard signal re-escalates
  // immediately, because assessConversationRisk re-evaluates every turn.
  const explicitlySafe =
    !safetyAck &&
    !hasHardSelfHarmOrSuicideCore(lastNormalized) &&
    // P4-A3: a calm affirmation cannot release crisis while a lethal means is still
    // stated as on-hand this turn ("我好多了，药还在床边"); disposal carve-out inside.
    !hasActiveMeansOrAccessCore(lastNormalized) &&
    CRISIS_DEESCALATION_PHRASES.some((phrase) => lastNormalized.includes(phrase));

  if (explicitlySafe) {
    return {
      active: false,
      deescalated: true,
      reason: "用户明确表示已安全/平复，保守解除危机模式（任何新风险信号会立即重新升级）"
    };
  }

  // If the latest user reply is a crisis-action ack ("1" / "我已经移开"), keep crisis
  // mode active — it is a safety step, not an all-clear.
  if (safetyAck) {
    return {
      active: true,
      deescalated: false,
      reason: "刚发出过危机回复，用户已回 '1=已经移开'，仍保持安全模式 1 轮"
    };
  }

  return { active: true, deescalated: false, reason: "刚发出过危机回复，且尚未收到安全确认" };
}

// ── RESTORED from transcript edit-fragments (2026-06-13): real code recovered ──
// These functions/constants existed in the deployed safety.ts but were captured
// only as edit-diffs (no full snapshot). Extracted verbatim and re-attached.
function includesAnyNormalized(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

const MINOR_AGE_RE = /(?:十[二三四五六七]|1[2-7])岁/;
const MINOR_CAREGIVER_GUARDS = [
  "我的学生", "我教的", "我带的班", "我当老师", "我是老师", "我是班主任",
  "我是家长", "我孩子", "我女儿", "我儿子", "我学生",
  "大学", "研究生", "读研", "考研", "考公", "我上班", "我工作", "职场", "我导师",
  "my student", "my kid", "my child", "my daughter", "my son",
  "i'm a teacher", "i'm a parent", "in college", "at work", "my coworker"
];
const MINOR_CONTEXT_CUES = [
  "未成年", "我还是学生", "我还是个学生", "我还小",
  "上初中", "上高中", "读初中", "读高中", "初中生", "高中生",
  "初一", "初二", "初三", "高一", "高二", "高三",
  "班主任", "我们班", "全班同学", "被同学", "同学孤立", "同学欺负",
  "上学", "不想上学", "校园霸凌", "被霸凌", "被孤立",
  "中考", "高考", "月考", "期末考", "我作业", "写作业",
  "爸妈不让", "爸妈会骂", "不敢告诉爸妈", "不敢跟爸妈说", "不敢跟父母说",
  // English
  "still in school", "high school", "middle school", "my classmates",
  "bullied at school", "being bullied", "underage", "i'm a student",
  "i'm a teenager", "my parents won't", "ninth grade", "tenth grade"
];
export type CrisisReplyTier = "escalate" | "stabilize";

/**
 * Interpret a lone 1–4 reply to a "reply one number" safety prompt and return
 * how to act on it, or null if this is not a numeric check-reply.
 *
 * The same digit means different things depending on which template just asked:
 *   - crisis-action scale ("moved items / someone here / about to call / can't"):
 *     only 4 ("I can't do this right now") needs harder escalation; 1–3 are progress.
 *   - severity scale ("safe-but-hurting / thoughts-no-plan / plan-or-method /
 *     not-sure-safe"): 3 and 4 need escalation.
 * Falls back to the severity scale (3/4 escalate) when the prompt's scale is
 * unclear, so an ambiguous "3" errs toward pushing for real-world help.
 *
 * `opts.assumeAsked` (2026-07-05, D4): the crisis resource block no longer asks
 * the "reply with one number" question in text (see createCrisisResourceBlock's
 * 2026-07-05 comment) — instead the crisis banner shows four buttons that send a
 * bare "1".."4" directly, equivalent to the user having typed it. Callers that
 * know the digit came from those buttons pass assumeAsked so this still classifies
 * it, without requiring the question to be present in priorAssistantText.
 */
export function classifyCrisisCheckReply(
  replyText: string,
  priorAssistantText: string,
  opts?: { assumeAsked?: boolean }
): { digit: 1 | 2 | 3 | 4; tier: CrisisReplyTier } | null {
  const reply = replyText.trim();
  if (!reply || reply.length > 40) return null;

  // Only treat a bare number as a check-reply if the assistant just asked for one
  // (in text) OR the caller already knows a check was asked (assumeAsked).
  const lowerPrior = priorAssistantText.toLowerCase();
  const askedForNumber =
    priorAssistantText.includes("一个数字") || lowerPrior.includes("one number") || opts?.assumeAsked === true;
  if (!askedForNumber) return null;

  const match = reply.match(
    /^(?:我选|选|回复?|答案?是?|answer:?\s*|option\s*|number\s*)?\s*([1-4])\b/i
  );
  if (!match) return null;
  const digit = Number(match[1]) as 1 | 2 | 3 | 4;

  const isCrisisActionScale =
    priorAssistantText.includes("移开危险物品") ||
    lowerPrior.includes("moved dangerous items away") ||
    priorAssistantText.includes("我准备打电话") ||
    lowerPrior.includes("i am about to call");

  const tier: CrisisReplyTier = isCrisisActionScale
    ? digit === 4
      ? "escalate"
      : "stabilize"
    : digit >= 3
      ? "escalate"
      : "stabilize";

  return { digit, tier };
}
export function getDangerLevel(assessment: RiskAssessment): DangerLevel {
  if (assessment.shouldEscalate || assessment.flags.includes("crisis_session_active") || assessment.level === "high") {
    return 3;
  }

  if (
    assessment.level === "medium" ||
    assessment.flags.some((flag) =>
      [
        "suicide_concern",
        "safety_confirmation",
        "concern_for_other",
        "medication_request",
        "diagnosis_request",
        "medical_red_flag"
      ].includes(flag)
    )
  ) {
    return 2;
  }

  return 1;
}
export function createGentleCheckResponse(cue: string | undefined, language: AppLanguage = "zh") {
  if (language === "en") {
    const lead = cue
      ? `I noticed what you just said — "${cue}" — it sounds like there's a fair bit weighing on you.`
      : "From what you're sharing, it sounds like there's a fair bit weighing on you.";
    return [
      lead,
      "",
      "You don't have to explain it all right now, and I'm not going to rush to analyze it. I just wanted to gently ask: lately, has it been the kind of tired — not just in your body but inside — where part of you wants to pause and rest? And if I've read it wrong, that's okay.",
      "",
      "If you'd like, you could tell me one more thing about what's felt heaviest. And if you'd rather not right now, that's okay — we can take it slow. I'm here."
    ].join("\n");
  }
  const lead = cue
    ? `我注意到你刚才说的那句——“${cue}”，听起来心里像是压了不少东西。`
    : "从你说的这些里，听起来心里像是压了不少东西。";
  return [
    lead,
    "",
    "你不用现在就解释清楚，我也不急着分析。只是想轻轻问一句：这阵子，是不是有那种“不只身体上、心里也撑得有点累、想停下来休息一下”的感觉？如果我没理解对，也没关系。",
    "",
    "如果愿意，可以多和我聊一句最近最沉的是什么；如果暂时不想说，我们就慢慢来，我在这儿。"
  ].join("\n");
}
export function createMinorSupportLine(language: AppLanguage = "zh"): string {
  if (language === "en") {
    return [
      "If you're still in school or under 18: alongside everything above, please reach a trusted adult as soon as you can — a parent, a relative you trust, or your school counselor or teacher. You deserve to have someone with you in person.",
      `Youth help: in the US/Canada call or text ${INTL_RESOURCES.usCrisis}, or text HOME to 741741 (Crisis Text Line). Elsewhere, find a local youth line at ${INTL_RESOURCES.finder}.`
    ].join("\n");
  }
  return [
    "如果你还在上学、未满 18 岁：除了上面的资源，也请尽快找一个信任的成年人陪着你——可以是学校的心理老师或班主任、信任的亲戚，或父母。你值得有人在现实里陪你一起面对。",
    `面向未成年人的求助：全国青少年服务台 ${CN_SUPPLEMENTAL.youth}（共青团心理援助），以及全国心理援助热线 ${PSYCH}。`
  ].join("\n");
}
export function hasMinorContextCue(text: string): boolean {
  if (!text) return false;
  const n = normalizeText(text);
  if (MINOR_CAREGIVER_GUARDS.some((g) => n.includes(normalizeText(g)))) return false;
  if (MINOR_AGE_RE.test(n)) return true;
  return MINOR_CONTEXT_CUES.some((c) => n.includes(normalizeText(c)));
}
export function createCrisisReplyResponse(tier: CrisisReplyTier, language: AppLanguage = "zh") {
  if (language === "en") {
    if (tier === "escalate") {
      return [
        "Thank you for telling me. From your answer, the most important thing right now is not this chat — it is getting a real person or emergency service to you in the next few minutes.",
        "",
        `Please do this now: call emergency or a crisis line, or reach someone who can come to you. US/Canada ${INTL_RESOURCES.usCrisis} or ${INTL_RESOURCES.usEmergency}; UK/Ireland ${INTL_RESOURCES.ukSamaritans} (Samaritans); Australia ${INTL_RESOURCES.auLifeline} (Lifeline); mainland China ${CN_EMS} or ${PSYCH}; elsewhere ${INTL_RESOURCES.finder}.`,
        "If anything you could use to hurt yourself is within reach, leave that room now or ask someone to hold it for you.",
        "",
        "I am staying right here with you, but I cannot replace in-person help. Can you make that call now, or tell me who is nearby that we can reach?"
      ].join("\n");
    }
    return [
      "Thank you for replying — that step matters, and it tells me you are looking out for yourself right now.",
      "",
      "Let's keep this to the next few minutes: both feet on the floor, breathe in for 4 and out for 6, a few rounds. Try not to be alone — if you haven't reached a real person yet, even one short message helps.",
      "If anything changes — the thoughts get stronger, a plan or method appears, or you are not sure you can stay safe — contact emergency help or someone nearby right away, and we go straight back to safety first.",
      "",
      "How are you doing right now — do you want to stay here a while, or talk about what just happened?"
    ].join("\n");
  }

  if (tier === "escalate") {
    return [
      "谢谢你回我。从你的回答看，现在最重要的事不是继续聊，而是让一个真实的人或急救服务在接下来几分钟里到你身边。",
      "",
      `请现在就做：拨打急救或危机热线，或联系一个能马上到场的人。中国大陆 ${CN_EMS}，或全国心理援助热线 ${PSYCH}；美国/加拿大 ${INTL_RESOURCES.usCrisis} 或 ${INTL_RESOURCES.usEmergency}；英国/爱尔兰 ${INTL_RESOURCES.ukSamaritans}；澳洲 ${INTL_RESOURCES.auLifeline}；其他地区可在 ${INTL_RESOURCES.finder} 找当地热线。`,
      "如果手边有可能伤害自己的东西，先离开那个房间，或请别人替你拿走。",
      "",
      "我会一直在这儿陪着你，但我不能替代现场帮助。你愿意现在就打这个电话，或者告诉我你身边能联系到谁吗？"
    ].join("\n");
  }
  return [
    "谢谢你回我——这一步很重要，说明你在照顾自己。",
    "",
    "我们就把注意力放在眼前几分钟：双脚踩地，慢慢吸气 4 秒、呼气 6 秒，做几轮。尽量不要一个人待着，如果还没联系到现实中的人，现在发一句也好。",
    "如果情况变了——念头变强、有了计划或工具、或者你不确定自己能不能安全——请立刻联系急救或身边的人，我们随时切回安全优先。",
    "",
    "你现在还好吗？想再待一会儿，还是说说刚才发生了什么？"
  ].join("\n");
}
function hasHardSelfHarmOrSuicideCore(normalized: string) {
  return includesAnyNormalized(normalized, [
    "不想活",
    "活不下去",
    "想死",
    "自杀",
    "轻生",
    "结束生命",
    "结束这一切",
    "kill myself",
    "suicide",
    "want to die",
    "end my life",
    "ending my life",
    "wobuxianghuo",
    "buxianghuo",
    "woxiangsi",
    "wozhenxiangsi",
    "woyaozisha",
    "xiangzisha",
    "stopexisting",
    "erasemyself",
    "deletemyself",
    "人生不续费",
    "不想再续费",
    "人生的关机键",
    "格式化自己",
    "把自己格式化",
    "清空自己",
    "把自己清空"
  ]);
}
function hasActiveMeansOrAccessCore(normalized: string): boolean {
  const meansPresent = includesAnyNormalized(normalized, [
    "药还在", "药在床边", "药在身边", "药在旁边", "药就在", "还留着药", "还攒着", "药没扔", "药没丢",
    "刀还在", "刀在身边", "刀在床边", "刀就在", "刀还放", "绳还在", "绳子还挂", "绳还留着",
    "在床头", "在床边", "在手边", "楼顶", "天台", "在桥上",
    "pills are still", "still have the pills", "knife is still", "still by my bed",
    "next to me", "on the roof", "on the bridge"
  ]);
  if (!meansPresent) return false;
  const disposed = includesAnyNormalized(normalized, [
    "移开", "扔了", "丢了", "倒掉", "处理掉", "交给", "拿走", "锁起来", "锁柜", "给室友", "给别人", "给了",
    "threw away", "got rid", "removed", "locked away", "gave them", "gave it"
  ]);
  return !disposed;
}
