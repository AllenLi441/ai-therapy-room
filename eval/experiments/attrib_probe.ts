/**
 * eval/experiments/attrib_probe.ts — 判官臂逐行模型归属探针(#1 层 3 证据闭合)。
 *
 * 背景:07-13 稳定重跑的 judge.jsonl 未落盘模型归属(工具缺陷,已修),
 * 「判官走 DeepSeek 兜底」只有会话内日志观察、无持久证据。本探针在相同账户
 * 状态下跑 10 个单元,逐行持久化 judgedBy/fallbackReason,作为可引用证据。
 * 预期(Kimi 欠费停用中):首行 fallbackReason=kimi_billing(触发熔断),
 * 后续行 kimi_circuit_open,全部 judgedBy=deepseek。
 *
 * 用法:npx tsx eval/experiments/attrib_probe.ts(从 app 仓库根)
 */
import { readFileSync, appendFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setupEvalEnv } from "../adapters/env";
import { runJudgeOnly } from "../adapters/judge";

setupEvalEnv();
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "results", "judge_attrib_probe.jsonl");

function take(file: string, n: number): Array<{ id: string; gold: string; text: string }> {
  const rows: Array<{ id: string; gold: string; text: string }> = [];
  for (const line of readFileSync(join(HERE, "..", "datasets", "safety", file), "utf8").split("\n")) {
    if (!line.trim() || rows.length >= n) continue;
    const r = JSON.parse(line);
    if (r._meta) continue;
    rows.push({ id: r.id, gold: r.label, text: (r.turns ?? [r.text])[0] });
  }
  return rows;
}

async function main() {
  rmSync(OUT, { force: true });
  const units = [
    ...take("explicit_ideation.jsonl", 4),
    ...take("hard_negative_slang.jsonl", 3),
    ...take("passive_wish.jsonl", 3)
  ];
  console.log(`[attrib_probe] ${units.length} units → ${OUT}`);
  for (const u of units) {
    const t0 = Date.now();
    const r = await runJudgeOnly([u.text], { timeoutMs: 12_000 });
    const outcome = (r.raw as { outcome?: { kind: string; result?: { judgedBy?: string; fallbackReason?: string } } }).outcome;
    const rec = {
      id: u.id, gold: u.gold, prediction: r.prediction,
      judgedBy: outcome?.kind === "ok" ? outcome.result?.judgedBy ?? null : null,
      fallbackReason: outcome?.kind === "ok" ? outcome.result?.fallbackReason ?? null : null,
      error: r.error ?? null, ms: Date.now() - t0, ranAt: new Date().toISOString()
    };
    appendFileSync(OUT, JSON.stringify(rec) + "\n");
    console.log(`  ${u.id}: judgedBy=${rec.judgedBy} fallback=${rec.fallbackReason} pred=${rec.prediction} ${rec.ms}ms`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
