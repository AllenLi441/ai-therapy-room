import type { AppLanguage, TherapyModality } from "./types";

// 2026-06-13: collapsed the former 4-persona roster into ONE integrative
// companion. The multi-persona switching added complexity without payoff, so
// the single companion flexibly draws on person-centered / CBT / ACT / MI / DBT
// as the moment calls for, instead of asking the user to pick a "role".
export type PersonaId = "companion";

export type TherapyPersona = {
  id: PersonaId;
  name: string;
  role: string;
  shortRole: string;
  description: string;
  image: string;
  modalityBias: TherapyModality[];
  focus: string[];
  tone: string[];
  avoid: string[];
  starterPrompts: string[];
};

export const DEFAULT_PERSONA_ID: PersonaId = "companion";

export const THERAPY_PERSONAS: TherapyPersona[] = [
  {
    id: "companion",
    name: "安屿",
    role: "心理陪伴者",
    shortRole: "倾听、梳理、温和的方法",
    description: "先认真听你说，再陪你慢慢梳理。需要时也会一起看想法循环、做一个小练习或整理想表达的话。",
    image: "/personas/companion.png",
    // Integrative: lead with listening, draw on the others only as the turn needs.
    modalityBias: ["person-centered", "CBT", "ACT", "MI", "DBT"],
    focus: ["情绪命名与共情", "看清想法-情绪-行为循环", "一个小而具体的行动", "需要与边界"],
    tone: ["温暖", "克制", "先接住情绪再分析", "不评判"],
    avoid: ["过早给建议", "长篇大道理", "诊断或贴标签", "羞辱式督促"],
    starterPrompts: [
      "我现在有点乱，不知道从哪里说起。",
      "先帮我听听，我不太想马上要建议。",
      "我想把今天最难受的一段讲出来。"
    ]
  }
];

type PersonaDisplay = Pick<TherapyPersona, "name" | "role" | "shortRole" | "description" | "starterPrompts">;

const PERSONA_DISPLAY_EN: Record<PersonaId, PersonaDisplay> = {
  companion: {
    name: "Anyu",
    role: "Companion",
    shortRole: "Listening, sense-making, gentle methods",
    description:
      "Listens first, then helps you make sense of things — drawing on thought-loop work, a small exercise, or framing what you want to say, as the moment needs.",
    starterPrompts: [
      "I feel scattered and do not know where to begin.",
      "Please just listen first. I do not want advice right away.",
      "I want to talk through the hardest part of today."
    ]
  }
};

export function resolvePersona(_id?: string | null): TherapyPersona {
  // Single companion now — always return it regardless of any legacy id.
  return THERAPY_PERSONAS[0];
}

export function getPersonaDisplay(persona: TherapyPersona, language: AppLanguage = "zh"): PersonaDisplay {
  if (language === "en") {
    return PERSONA_DISPLAY_EN[persona.id];
  }

  return {
    name: persona.name,
    role: persona.role,
    shortRole: persona.shortRole,
    description: persona.description,
    starterPrompts: persona.starterPrompts
  };
}

export function formatPersonaForPrompt(persona?: TherapyPersona | null) {
  if (!persona) {
    return "使用静室默认风格：专业、克制、温和，不进行角色表演。";
  }

  return [
    `前台虚拟陪伴者：${persona.name}，${persona.role}。`,
    `主要适用：${persona.shortRole}。`,
    `优先关注：${persona.focus.join("、")}。`,
    `表达气质：${persona.tone.join("、")}。`,
    `可灵活采用的取向：${persona.modalityBias.join("、")}，以倾听承接为先，按当下需要再选用，不要生硬套用；风险和个案判断永远优先。`,
    `需要避免：${persona.avoid.join("、")}。`,
    "这是前台对话风格，不是真人身份。不要声称自己是医生、持证咨询师或有个人经历。"
  ].join("\n");
}
