import type { SessionPlan, TurnPlan } from "./types";

export function defaultTurnPlan(): TurnPlan {
  return {
    modality: "person-centered",
    protocolStep: "准确倾听并反映用户最核心的痛点",
    whatToReflect: "用户最在意、最痛的那一点",
    intervention: "用一句话承接情绪，不急着给方法",
    clarifyingQuestion: "你最希望我先听见的是哪一段？",
    avoid: "不要一次塞多个建议，不要给保证"
  };
}

// ── RECOVERED-RECONSTRUCTION (2026-06-13) ─────────────────────────────────────
// crisis / suicideConcern / medication / diagnosis turn plans were NOT present
// in any Claude Code or Codex transcript (only their call sites in
// case-formulation.ts were). These are reconstructed from the TurnPlan shape and
// the app's EXISTING safety stance (safety.ts danger-level instructions), so the
// recovered app compiles and routes sensibly. ⚠️ The crisis/suicide variants
// steer counselor behaviour in safety-sensitive turns — review against your real
// clinical protocol before relying on the exact wording.
export function crisisTurnPlan(): TurnPlan {
  return {
    modality: "crisis",
    protocolStep: "进入安全模式：先稳定情绪、确认眼前安全",
    whatToReflect: "用户当下的痛苦与危险信号，而不是追问原因",
    intervention: "用短句安抚，优先身体安全，引导联系现实中的人和紧急资源",
    clarifyingQuestion: "现在这一刻你安全吗？身边有没有人可以陪着你？",
    avoid: "不要分析对错、不要深度追问、不要给保证或刺激用户"
  };
}

export function suicideConcernTurnPlan(): TurnPlan {
  return {
    modality: "crisis",
    protocolStep: "承接自杀意念信号，做一次简短的即时安全确认",
    whatToReflect: "用户话里隐含的无望、想消失或不想继续的部分",
    intervention: "认真对待该信号，鼓励联系现实支持，用很短的选择题确认当前安全程度",
    clarifyingQuestion: "你现在是有这样的念头，还是已经有具体的计划或工具？",
    avoid: "不要把它当普通抱怨放过，也不要急着深度分析原因"
  };
}

export function medicationTurnPlan(): TurnPlan {
  return {
    modality: "person-centered",
    protocolStep: "守住用药边界，转介持证医疗",
    whatToReflect: "用户对症状或药物的担忧",
    intervention: "说明不能给药名、剂量或加减停换药建议；建议联系精神科或持证医生，并帮助整理就诊信息",
    clarifyingQuestion: "要不要我帮你把症状和用药情况整理成就诊时可以说的清单？",
    avoid: "不要给出任何具体药名、剂量或用药调整建议"
  };
}

export function diagnosisTurnPlan(): TurnPlan {
  return {
    modality: "person-centered",
    protocolStep: "守住诊断边界，转介专业评估",
    whatToReflect: "用户想知道自己是不是某种疾病的焦虑",
    intervention: "说明聊天里不能替代专业诊断；主动建议精神科、心理科或学校心理老师等线下路径，并帮助整理就诊信息",
    clarifyingQuestion: "我们先把症状和持续时间一起整理清楚，方便你带去给专业人员评估，好吗？",
    avoid: "不要给出或确认任何诊断或疾病名称"
  };
}

export function encodeSessionPlanHeader(plan: SessionPlan) {
  const json = JSON.stringify(plan);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeSessionPlanHeader(value: string): SessionPlan | null {
  try {
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(value, "base64").toString("utf-8")
        : decodeURIComponent(escape(atob(value)));
    const parsed = JSON.parse(json) as SessionPlan;
    if (!parsed?.caseMap || !parsed?.turnPlan) return null;
    return parsed;
  } catch {
    return null;
  }
}
