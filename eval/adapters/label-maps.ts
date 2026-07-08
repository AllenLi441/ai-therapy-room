import type { RiskAssessment } from "@/lib/types";
import type { ImplicitOutcome, ImplicitDecision } from "@/lib/implicit-risk";
import type { DecisionRoute } from "@/lib/decision-log";
import type { Branch, UnifiedLabel } from "./result";

/** 分支优先级严格镜像 route.ts 的分支顺序(见 src/app/api/chat/route.ts 的
 *  lexicon_crisis → lexicon_suicide_concern → lexicon_medication →
 *  lexicon_diagnosis → lexicon_medical_red_flag 判定顺序,以及 safety.ts 里
 *  shouldEscalate 只在 level==="high" 时为真)。 */
export function branchFromLexicon(risk: RiskAssessment): Branch {
  if (risk.shouldEscalate) return "crisis";
  if (risk.flags.includes("suicide_concern")) return "suspected";
  if (risk.flags.includes("medication_request")) return "medication";
  if (risk.flags.includes("diagnosis_request")) return "diagnosis";
  if (risk.flags.includes("medical_red_flag")) return "medical_redflag";
  return "normal";
}

/** 词表粗粒度标签:high(escalate)→crisis;medium 自杀关切→passive_ideation
 *  (词表 medium 自杀列表以被动愿望措辞为主;主动意念短语在 HIGH 列表→crisis)。
 *  映射固定且承认粗糙 —— 逐分支指标是它的补充视角。 */
export function labelFromLexicon(risk: RiskAssessment): UnifiedLabel {
  if (risk.shouldEscalate) return "crisis";
  if (risk.flags.includes("suicide_concern")) return "passive_ideation";
  return "none";
}

/** 判官标签:非 ok→null;pragmatic!=="self"→"none";severity 映射:
 *  none→none;passive_death_wish→passive_ideation;
 *  suicidal_ideation|non_suicidal_self_harm→active_ideation;
 *  plan_preparation|imminent_acute|post_attempt_disclosure→crisis */
export function labelFromJudge(outcome: ImplicitOutcome): UnifiedLabel | null {
  if (outcome.kind !== "ok") return null;
  const r = outcome.result;
  if (r.pragmatic !== "self") return "none";
  switch (r.severity) {
    case "none":
      return "none";
    case "passive_death_wish":
      return "passive_ideation";
    case "suicidal_ideation":
    case "non_suicidal_self_harm":
      return "active_ideation";
    case "plan_preparation":
    case "imminent_acute":
    case "post_attempt_disclosure":
      return "crisis";
    default:
      return "none";
  }
}

export function branchFromDecision(d: ImplicitDecision): Branch {
  if (!d.intercept) return "normal";
  if (d.mode === "crisis") return "crisis";
  if (d.mode === "suicide_concern") return "suspected";
  return "gentle_check";
}

export function routeToBranch(route: DecisionRoute): Branch {
  switch (route) {
    case "lexicon_crisis":
    case "implicit_crisis":
      return "crisis";
    case "lexicon_suicide_concern":
    case "implicit_suicide_concern":
    case "implicit_fail_safe":
      return "suspected";
    case "implicit_gentle_check":
      return "gentle_check";
    case "lexicon_medication":
      return "medication";
    case "lexicon_diagnosis":
      return "diagnosis";
    case "lexicon_medical_red_flag":
      return "medical_redflag";
    case "crisis_check_reply":
      return "crisis";
    case "deepseek_normal":
      return "normal";
    default:
      return "normal";
  }
}

export function labelFromBranch(b: Branch): UnifiedLabel {
  if (b === "crisis") return "crisis";
  if (b === "suspected") return "active_ideation";
  if (b === "gentle_check") return "passive_ideation";
  return "none";
}
