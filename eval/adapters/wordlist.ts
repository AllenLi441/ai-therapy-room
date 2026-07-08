import { assessRisk, assessConversationRisk } from "@/lib/safety";
import type { AdapterResult } from "./result";
import { branchFromLexicon, labelFromLexicon } from "./label-maps";

/** 臂 a:纯词表。string=单轮(assessRisk);string[]=多轮用户消息(assessConversationRisk)。
 *  纯函数、零网络,latency 用 performance.now() 环绕(≈0,仍如实记录)。 */
export function runWordlistOnly(input: string | string[]): AdapterResult {
  const t0 = performance.now();
  const risk = Array.isArray(input)
    ? assessConversationRisk(input.map((content) => ({ role: "user" as const, content })))
    : assessRisk(input);
  const latencyMs = performance.now() - t0;

  return {
    prediction: labelFromLexicon(risk),
    branch: branchFromLexicon(risk),
    interventionTiming: "blocking",
    latencyMs,
    raw: risk
  };
}
