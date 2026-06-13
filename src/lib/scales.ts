import type { ScaleId, ScaleResult } from "./types";

export type ScaleDefinition = {
  id: ScaleId;
  name: string;
  intro: string;
  windowDays: number;
  options: { label: string; value: number }[];
  items: string[];
  scoring: (total: number) => string;
  trigger: string[];
};

const FOUR_POINT_OPTIONS = [
  { label: "完全不会", value: 0 },
  { label: "好几天", value: 1 },
  { label: "一半以上的日子", value: 2 },
  { label: "几乎每天", value: 3 }
];

const FIVE_POINT_OPTIONS = [
  { label: "无", value: 0 },
  { label: "轻度", value: 1 },
  { label: "中度", value: 2 },
  { label: "重度", value: 3 },
  { label: "极重度", value: 4 }
];

export const SCALES: ScaleDefinition[] = [
  {
    id: "PHQ-9",
    name: "PHQ-9 抑郁筛查",
    intro: "回想最近两周，你被以下问题困扰的频率。",
    windowDays: 14,
    options: FOUR_POINT_OPTIONS,
    items: [
      "做事时提不起劲或没有兴趣",
      "感到心情低落、沮丧或绝望",
      "入睡困难、睡不安稳或睡眠过多",
      "感觉疲倦或没有活力",
      "食欲不振或吃太多",
      "觉得自己很糟，或觉得自己是个失败者，或让自己或家人失望",
      "对事物专注有困难，例如看报纸或看电视",
      "动作或说话速度缓慢到别人已经察觉？或正好相反，烦躁或坐立不安、动来动去的情况更胜于平常",
      "有不如死掉或用某种方式伤害自己的念头"
    ],
    scoring(total) {
      if (total <= 4) return "极轻或正常范围";
      if (total <= 9) return "轻度抑郁倾向";
      if (total <= 14) return "中度抑郁倾向";
      if (total <= 19) return "中重度抑郁倾向";
      return "重度抑郁倾向";
    },
    trigger: ["低落", "抑郁", "没意思", "麻木", "提不起劲", "没动力", "想死", "活不下去", "空虚"]
  },
  {
    id: "GAD-7",
    name: "GAD-7 焦虑筛查",
    intro: "回想最近两周，你被以下问题困扰的频率。",
    windowDays: 14,
    options: FOUR_POINT_OPTIONS,
    items: [
      "感觉紧张、焦虑或急躁",
      "无法停止或控制担忧",
      "对各种各样的事情过度担忧",
      "很难放松下来",
      "心绪不宁以至于很难坐定",
      "变得容易烦恼或急躁",
      "因为感觉好像有什么可怕的事情会发生而害怕"
    ],
    scoring(total) {
      if (total <= 4) return "正常范围";
      if (total <= 9) return "轻度焦虑";
      if (total <= 14) return "中度焦虑";
      return "重度焦虑";
    },
    trigger: ["焦虑", "紧张", "担心", "心慌", "停不下来", "害怕", "压力"]
  },
  {
    id: "ISI",
    name: "ISI 失眠严重程度",
    intro: "回想最近两周的睡眠情况。",
    windowDays: 14,
    options: FIVE_POINT_OPTIONS,
    items: [
      "入睡困难的严重程度",
      "维持睡眠困难的严重程度",
      "比期望时间过早醒来的严重程度",
      "对当前睡眠模式的满意程度（0=非常满意，4=非常不满意）",
      "睡眠问题对日间功能（疲劳、专注、记忆、情绪等）的干扰程度",
      "他人能注意到你睡眠问题影响生活质量的程度",
      "对当前睡眠问题的担忧或痛苦程度"
    ],
    scoring(total) {
      if (total <= 7) return "无明显失眠";
      if (total <= 14) return "亚临床失眠";
      if (total <= 21) return "中度临床失眠";
      return "重度临床失眠";
    },
    trigger: ["失眠", "睡不着", "早醒", "入睡", "熬夜", "半夜醒", "睡眠", "睡", "凌晨", "困"]
  }
];

export function getScaleById(id: ScaleId) {
  return SCALES.find((scale) => scale.id === id);
}

export function suggestScale(text: string): ScaleId | null {
  if (!text) return null;
  const normalized = text.toLowerCase();
  const ranked = SCALES.map((scale) => ({
    id: scale.id,
    score: scale.trigger.filter((term) => normalized.includes(term)).length
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.id ?? null;
}

export function scoreScale(id: ScaleId, answers: number[]): ScaleResult | null {
  const definition = getScaleById(id);
  if (!definition) return null;
  if (answers.length !== definition.items.length) return null;

  const total = answers.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  return {
    id,
    total,
    severity: definition.scoring(total),
    answers,
    completedAt: new Date().toISOString()
  };
}
