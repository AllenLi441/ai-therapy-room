import { assessRisk } from "@/lib/safety";
import { assessImplicitRiskWithLLM, decideImplicitIntercept } from "@/lib/implicit-risk";
import type { ChatMessage } from "@/lib/types";
import type { AdapterResult } from "./result";
import { branchFromDecision, labelFromJudge } from "./label-maps";

/** 臂 b:纯 LLM 判官。词表输入固定为中性(assessRisk("")),隔离判官自身的拦截策略。
 *  判官不可用(not_configured/error)时不 mock 成功:如实记录 error 字段,
 *  branch 仍取 decideImplicitIntercept 的 fail-safe 决策(即生产真实行为)。 */
export async function runJudgeOnly(
  input: string | string[],
  opts: { timeoutMs?: number } = {}
): Promise<AdapterResult> {
  const messages: ChatMessage[] = Array.isArray(input)
    ? input.map((content) => ({ role: "user" as const, content }))
    : [{ role: "user" as const, content: input }];

  const t0 = performance.now();
  const outcome = await assessImplicitRiskWithLLM(messages, opts.timeoutMs);
  const latencyMs = performance.now() - t0;

  const neutralLexicon = assessRisk("");
  const decision = decideImplicitIntercept(outcome, neutralLexicon);

  const error =
    outcome.kind === "error" ? outcome.reason : outcome.kind === "not_configured" ? "not_configured" : undefined;

  return {
    prediction: labelFromJudge(outcome),
    confidence: outcome.kind === "ok" ? outcome.result.confidence : undefined,
    branch: branchFromDecision(decision),
    interventionTiming: "blocking",
    latencyMs,
    error,
    raw: { outcome, decision }
  };
}
