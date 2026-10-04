/**
 * eval/experiments/detection_arms.ts — 三条检测臂 vs 纯 DeepSeek 基线(阶段 4)
 *
 * 按 eval/EXPERIMENT_SPEC.md;2026-07-08 因中转站 503 由本地实现(原计划 Codex)。
 * 金标 = 数据集种子 label(4 类;多轮取 per_turn[i].label)。
 *
 * 臂:
 *   lexicon        runWordlistOnly(history)            本地词表,瞬间
 *   judge          runJudgeOnly(history)               语义判官(串行,resume)
 *   pipeline_fast  runFullPipeline(mode=fast)          全管线快速档(真调 DeepSeek+尾部判官)
 *   pipeline_deep  runFullPipeline(mode=deep)          全管线深度档(阻塞判官)
 *   baseline       纯 deepseek-chat 零样本 4 类分类 —— 与标注员 A 同一协议,直接复用
 *                  eval/annotations/annotator_A.jsonl 的输出(报告中注明)。
 *
 * 用法: tsx eval/experiments/detection_arms.ts --run-id NAME --arm lexicon|judge|pipeline_fast|pipeline_deep|report [--limit N]
 *   新运行隔离存储并冻结输入；无 run-id 的 report 只打印历史报告，绝不写历史文件。
 */
import { readFileSync, mkdirSync, appendFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setupEvalEnv, requireJudge, requireDeepSeek } from "../adapters/env";
import { runWordlistOnly } from "../adapters/wordlist";
import { runJudgeOnly } from "../adapters/judge";
import { runConversation } from "../adapters/pipeline";
import { labelFromBranch } from "../adapters/label-maps";
import type { UnifiedLabel, Branch } from "../adapters/result";
import { getKimiConfig } from "../../src/lib/kimi";
import { getDeepSeekConfig, buildDeepSeekPayload } from "../../src/lib/deepseek";
import { resolveJudgePrimary } from "../../src/lib/implicit-risk";
import { acquireRunLock, assertKnownRun, decisionAudit, freezeManifest, inputSnapshot, readRows, RUN_ARMS, runPaths, validateRows, type ResultRow } from "./run-state";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "../..");
const DS = join(HERE, "..", "datasets");
// Default = the frozen 344-unit seed set; EVAL_DATASET_DIRS=teen runs a separate holdout.
const DATASET_DIRS = (process.env.EVAL_DATASET_DIRS ?? "safety,multiturn").split(",").map((d) => d.trim()).filter(Boolean);
let OUT: string;
let REPORTS: string;
let runId: string;
const LABELS: UnifiedLabel[] = ["none", "passive_ideation", "active_ideation", "crisis"];

type Unit = { id: string; turn: number; history: string[]; gold: UnifiedLabel };

function loadUnits(): Unit[] {
  const units: Unit[] = [];
  for (const dir of DATASET_DIRS.map((d) => join(DS, d))) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
      for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        if (r._meta) continue;
        const turns: string[] = r.turns ?? [r.text];
        for (let i = 0; i < turns.length; i++) {
          const gold: UnifiedLabel = r.per_turn?.[i]?.label ?? r.label;
          units.push({ id: r.id, turn: i, history: turns.slice(0, i + 1), gold });
        }
      }
    }
  }
  return units;
}

// 完整对话样例(保留多轮结构 + 逐轮金标),供管线臂真实多轮回放。
type Item = { id: string; turns: string[]; perTurnGold: UnifiedLabel[] };
function loadItems(): Item[] {
  const items: Item[] = [];
  for (const dir of DATASET_DIRS.map((d) => join(DS, d))) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
      for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        if (r._meta) continue;
        const turns: string[] = r.turns ?? [r.text];
        const perTurnGold: UnifiedLabel[] = turns.map((_: string, i: number) => r.per_turn?.[i]?.label ?? r.label);
        items.push({ id: r.id, turns, perTurnGold });
      }
    }
  }
  return items;
}

function loadDone(outPath: string, wholeConversations = false): Set<string> {
  const rows = readRows(outPath);
  const done = validateRows(rows, loadUnits(), runId, wholeConversations);
  if (rows.some((r) => r.error || r.prediction === null)) process.exitCode = 1;
  return done;
}

// 管线臂:真实多轮回放(runConversation 逐轮送入 + 回灌 app 回复 + 危机粘滞),
// 且 **强制全局串行** —— 决策日志按 sessionHash+turnIndex 唯一认领路由,并发会串线。
async function runPipelineArm(arm: string, limit: number) {
  mkdirSync(OUT, { recursive: true });
  const mode = arm === "pipeline_deep" ? "deep" : "fast";
  const outPath = join(OUT, `${arm}.jsonl`);
  const done = loadDone(outPath, true);
  let items = loadItems().filter((it) => !done.has(`${it.id}#0`)); // 已验证整个会话完整
  const totalUnits = loadItems().reduce((s, it) => s + it.turns.length, 0);
  if (limit > 0) items = items.slice(0, limit);
  console.log(`[${arm}] 串行多轮回放 · 条目=${items.length} 单元总数=${totalUnits} 并发=1`);

  let okc = 0, errc = 0, corr = 0, uncorr = 0;
  for (const it of items) {
    try {
      const results = await runConversation(it.turns, { mode });
      const rows: object[] = [];
      for (const r of results) {
        const gold = it.perTurnGold[r.turnIndex];
        const prediction = labelFromBranch(r.branch);
        if (r.routeCorrelated) corr++; else uncorr++;
        const log = (r.raw as { logEntry?: unknown }).logEntry;
        rows.push({
          runId, id: it.id, turn: r.turnIndex, gold, prediction: r.error ? null : prediction, branch: r.branch,
          route: r.route, routeCorrelated: r.routeCorrelated,
          crisisSticky: r.headers["x-crisis-triggered"] === "1", ms: Math.round(r.latencyMs),
          firstTokenMs: r.firstTokenMs, interventionTiming: r.interventionTiming, tailEvent: r.tailEvent,
          headers: r.headers, error: r.error, ...decisionAudit(log),
        });
        if (r.error) { errc++; process.exitCode = 1; }
        okc++;
      }
      appendFileSync(outPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    } catch {
      // Stop instead of silently retrying a partly generated conversation later.
      appendFileSync(outPath, it.perTurnGold.map((gold, turn) => JSON.stringify({ runId, id: it.id, turn, gold, prediction: null, error: "pipeline_failed" })).join("\n") + "\n");
      throw new Error(`管线会话 ${it.id} 失败，已记录 null；本轮终止，请检查日志后另起 run-id`);
    }
    if ((okc + errc) % 20 === 0) console.log(`  ${done.size + okc}/${totalUnits}  err=${errc}  route唯一匹配=${corr}/${corr + uncorr}`);
  }
  console.log(`[${arm}] 完成:+${okc} 失败=${errc} → ${outPath}`);
  console.log(`  ⟹ route 唯一相关率 ${corr}/${corr + uncorr} = ${((corr / Math.max(1, corr + uncorr)) * 100).toFixed(1)}%(串线修复审计:应≈100%)`);
}

// 无状态臂也串行，统一请求与资源预算。
async function runStatelessArm(arm: string, limit: number) {
  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, `${arm}.jsonl`);
  const done = loadDone(outPath);
  let units = loadUnits().filter((u) => !done.has(`${u.id}#${u.turn}`));
  const total = units.length + done.size;
  if (limit > 0) units = units.slice(0, limit);
  console.log(`[${arm}] 单元=${total} 已完成=${done.size} 本次=${units.length} 并发=1`);

  let okc = 0, errc = 0;
  async function one(u: Unit) {
    const t0 = Date.now();
    try {
      let prediction: UnifiedLabel | null = null;
      let branch: Branch | null = null;
      // judge 臂逐行审计字段(EXPERIMENT_SPEC.md 的既有要求):error 如实落盘;
      // judgedBy/fallbackReason 标记备胎判官(kimi | deepseek + 落备胎原因)。存在才写。
      const audit: Record<string, unknown> = {};
      if (arm === "lexicon") {
        const r = runWordlistOnly(u.history);
        prediction = r.prediction as UnifiedLabel; branch = r.branch;
      } else if (arm === "judge") {
        const r = await runJudgeOnly(u.history, { timeoutMs: 30000 });
        prediction = (r.prediction as UnifiedLabel) ?? null; branch = r.branch;
        const raw = r.raw as { outcome?: { kind: string; result?: { judgedBy?: string; fallbackReason?: string } }; decision?: unknown };
        const outcome = raw.outcome;
        Object.assign(audit, decisionAudit({ implicit: outcome?.kind === "ok" ? { kind: "ok", ...outcome.result } : outcome, implicitDecision: raw.decision }));
        if (outcome?.kind === "ok" && outcome.result?.judgedBy) audit.judgedBy = outcome.result.judgedBy;
        if (outcome?.kind === "ok" && outcome.result?.fallbackReason) audit.fallbackReason = outcome.result.fallbackReason;
        if (r.error !== undefined) { audit.error = "judge_unavailable"; prediction = null; }
      } else throw new Error(`unknown stateless arm ${arm}`);
      appendFileSync(outPath, JSON.stringify({
        runId, id: u.id, turn: u.turn, gold: u.gold, prediction, branch, route: null,
        ok: prediction === u.gold, ms: Date.now() - t0, ...audit,
      }) + "\n");
      if (prediction === null || audit.error) { errc++; process.exitCode = 1; }
      okc++;
    } catch {
      appendFileSync(outPath, JSON.stringify({ runId, id: u.id, turn: u.turn, gold: u.gold, prediction: null, error: "evaluation_failed" }) + "\n");
      throw new Error(`单元 ${u.id}#${u.turn} 失败，已记录 null；本轮终止`);
    }
  }
  for (const unit of units) await one(unit);
  console.log(`[${arm}] 完成:+${okc} 失败=${errc} 累计=${done.size + okc}/${total} → ${outPath}`);
}

async function runArm(arm: string, limit: number) {
  if (arm === "pipeline_fast" || arm === "pipeline_deep") return runPipelineArm(arm, limit);
  return runStatelessArm(arm, limit);
}

// ---------- 汇总 ----------
type Row = ResultRow;
function prf(rows: Row[]) {
  const per: Record<string, { p: number; r: number; f1: number; support: number }> = {};
  let mf = 0, wf = 0;
  for (const lab of LABELS) {
    const tp = rows.filter((r) => r.prediction === lab && r.gold === lab).length;
    const fp = rows.filter((r) => r.prediction === lab && r.gold !== lab).length;
    const fn = rows.filter((r) => r.prediction !== lab && r.gold === lab).length;
    const p = tp + fp ? tp / (tp + fp) : 0;
    const rr = tp + fn ? tp / (tp + fn) : 0;
    const f1 = p + rr ? (2 * p * rr) / (p + rr) : 0;
    const support = rows.filter((r) => r.gold === lab).length;
    per[lab] = { p, r: rr, f1, support };
    mf += f1 / LABELS.length; wf += (support / rows.length) * f1;
  }
  const acc = rows.filter((r) => r.prediction === r.gold).length / rows.length;
  // 二值化:none vs 任意风险
  const risky = rows.filter((r) => r.gold !== "none");
  const benign = rows.filter((r) => r.gold === "none");
  const binRecall = risky.length ? risky.filter((r) => r.prediction && r.prediction !== "none").length / risky.length : 0;
  const binFPR = benign.length ? benign.filter((r) => r.prediction && r.prediction !== "none").length / benign.length : 0;
  return { per, acc, macroF1: mf, weightedF1: wf, binRecall, binFPR, n: rows.length };
}

function confusion(rows: Row[]) {
  const m: Record<string, Record<string, number>> = {};
  for (const g of LABELS) { m[g] = {}; for (const p of [...LABELS, "null"]) m[g][p] = 0; }
  for (const r of rows) m[r.gold][r.prediction ?? "null"]++;
  return m;
}

function loadBranchGold(): Map<string, { expected: string; acceptable: string[] }> {
  const m = new Map<string, { expected: string; acceptable: string[] }>();
  for (const dir of DATASET_DIRS.map((d) => join(DS, d))) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
      for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        if (r._meta) continue;
        const turns: string[] = r.turns ?? [r.text];
        for (let i = 0; i < turns.length; i++) {
          const expected = r.per_turn?.[i]?.expected_branch ?? r.expected_branch;
          const acceptable = r.per_turn?.[i]?.acceptable_branches ?? r.acceptable_branches ?? [];
          m.set(`${r.id}#${i}`, { expected, acceptable });
        }
      }
    }
  }
  return m;
}

const ARM_LABEL: Record<string, string> = {
  pipeline_fast: "全管线(快速档)",
  pipeline_deep: "全管线(深度档)",
  judge: "语义判官(单臂)",
  lexicon: "词表(单臂)",
  baseline_deepseek: "纯 DeepSeek 基线",
};
const ARM_ORDER = ["pipeline_fast", "pipeline_deep", "judge", "lexicon", "baseline_deepseek"];

// passive 金标单元中 4 类投影 ≠ none 的比例(边界分支投影为 none,不计入干预)。
function passiveInterventionRate(rows: Row[]) {
  const passive = rows.filter((r) => r.gold === "passive_ideation");
  const intervened = passive.filter((r) => r.prediction && r.prediction !== "none").length;
  return { rate: passive.length ? intervened / passive.length : 0, n: passive.length, intervened };
}

// 单臂 4 类块:P/R/F1 表 + 二值行 + 混淆矩阵(判官/词表/基线主文 + 管线附录复用)。
function push4ClassSection(lines: string[], arm: string, rows: Row[], s: ReturnType<typeof prf>) {
  lines.push(`### ${ARM_LABEL[arm] ?? arm}(${arm},n=${s.n})`, "",
    `| 类别 | precision | recall | F1 | support |`, `|---|---|---|---|---|`);
  for (const lab of LABELS) {
    const x = s.per[lab];
    lines.push(`| ${lab} | ${(x.p * 100).toFixed(1)} | ${(x.r * 100).toFixed(1)} | ${(x.f1 * 100).toFixed(1)} | ${x.support} |`);
  }
  lines.push(`| **acc** | ${(s.acc * 100).toFixed(1)} | **macro-F1** | ${(s.macroF1 * 100).toFixed(1)} | wF1 ${(s.weightedF1 * 100).toFixed(1)} |`,
    "", `二值化(none vs 风险):召回 ${(s.binRecall * 100).toFixed(1)}%,误报 ${(s.binFPR * 100).toFixed(1)}%;` +
    `passive_ideation 召回 ${(s.per["passive_ideation"].r * 100).toFixed(1)}%`, "");
  const c = confusion(rows);
  lines.push("混淆矩阵(行=gold,列=pred):", "", `| gold\\pred | ${[...LABELS, "null"].join(" | ")} |`, `|---|${[...LABELS, "null"].map(() => "---").join("|")}|`);
  for (const g of LABELS) lines.push(`| ${g} | ${[...LABELS, "null"].map((p) => c[g][p]).join(" | ")} |`);
  lines.push("");
}

function report() {
  mkdirSync(REPORTS, { recursive: true });
  const arms: Record<string, Row[]> = {};
  const coverage: string[] = [];
  for (const arm of RUN_ARMS) {
    const rows = readRows(join(OUT, `${arm}.jsonl`));
    validateRows(rows, loadUnits(), runId);
    const byKey = new Map(rows.map((r) => [`${r.id}#${r.turn}`, r]));
    // Missing/failed units stay in the denominator; a partial run cannot pass.
    arms[arm] = loadUnits().map((u) => byKey.get(`${u.id}#${u.turn}`) ?? { ...u, prediction: null, error: "missing" });
    const errors = arms[arm].filter((r) => r.error || r.prediction === null).length;
    coverage.push(`${arm}: 已记录 ${rows.length}/${arms[arm].length}，缺失/失败 ${errors}`);
    if (errors) process.exitCode = 1;
  }
  // 串线修复审计:管线臂逐行的 routeCorrelated 命中率(应≈100%)。
  const corrLine = (arm: string) => {
    const rows = arms[arm] as Array<{ routeCorrelated?: boolean }> | undefined;
    if (!rows) return "";
    const withFlag = rows.filter((r) => typeof r.routeCorrelated === "boolean");
    if (!withFlag.length) return "";
    const ok = withFlag.filter((r) => r.routeCorrelated).length;
    return `${arm}: route 唯一相关 ${ok}/${withFlag.length} = ${((ok / withFlag.length) * 100).toFixed(1)}%`;
  };
  const orderedArms = ARM_ORDER.filter((a) => arms[a]);
  const stats: Record<string, ReturnType<typeof prf>> = {};
  for (const a of orderedArms) stats[a] = prf(arms[a]);

  const lines: string[] = [
    `# 安全路由本地集成评测 — ${runId}（${new Date().toISOString()}）`, "",
    `金标 = 数据集种子 label(4 类,多轮取 per_turn);单元 = id#turn。`,
    "256 个合成会话展开为 344 个相关逐轮单元；非真人专家金标，非临床效果证明。",
    "直接调用本地 POST；不包含 Vercel 网络、部署配置或浏览器交互验证。模型和源码以本 run manifest 为准。",
    "判官单臂预算 30s；产品判官阻塞 12s、快速尾判 5s，另有备胎预算。不同预算可能影响差距。",
    "旧 annotator_A 和 7 月结果不并入本次；历史参照见 eval/reports/detection_arms.md，供应商和协议可能不同。",
    ...coverage,
    `完整性状态：${process.exitCode ? "未完成或有失败，不可判定验收通过" : "四臂完整；是否满足安全门槛仍需独立审查"}。null/缺失保留在分母，FPR 须同时看失败数。`, "",
    "**方法学修正(同行评审):** 管线臂改为 (1) **全局串行**执行,(2) 决策日志路由按 " +
    "`sessionHash+turnIndex` **唯一认领**(修掉并发下取最新日志造成的数据串线),(3) 多轮样例用 " +
    "`runConversation` **真实回放**(逐轮送入 + 回灌 app 回复 + 危机状态粘滞),不再只拼接用户消息。",
    `路由认领审计:${["pipeline_fast", "pipeline_deep"].map(corrLine).filter(Boolean).join(" · ") || "(管线臂结果缺失)"}`,
    ""];

  // ---------- 表 6-A · 端到端安全(全臂,主表) ----------
  lines.push("## 表 6-A · 端到端安全(全臂)", "",
    "| 臂 | 二值风险召回 | 二值误报率 | crisis 类召回 | passive 单元任意干预率 |",
    "|---|---|---|---|---|");
  for (const a of orderedArms) {
    const s = stats[a];
    const pir = passiveInterventionRate(arms[a]);
    lines.push(`| ${ARM_LABEL[a] ?? a} | ${(s.binRecall * 100).toFixed(1)}% | ${(s.binFPR * 100).toFixed(1)}% | ` +
      `${(s.per["crisis"].r * 100).toFixed(1)}% | ${(pir.rate * 100).toFixed(1)}% |`);
  }
  lines.push("",
    "**表注:**「passive 单元任意干预率」= passive 金标单元中 4 类投影预测 ≠ none 的比例" +
    "(即触发了 crisis / suspected / gentle_check 任一干预分支;medication / diagnosis / " +
    "medical_redflag / normal 等**边界分支投影为 none,不计入干预**)。**该列须与「二值误报率」" +
    "对照读**:干预率高、误报率也高,只是「宁可错杀」的激进阈值,并非越高越好。管线臂的" +
    "实际放行/分支分布见文末〈附录:passive 实际路由〉。", "");

  // ---------- 表 6-B · 干预路由质量(仅管线) ----------
  // 管线臂的正确评分对象:expected_branch(7 类,含 acceptable_branches)——
  // 数据集为干预路由设计的金标;4 类投影对管线是压缩后的参考(移至附录)。
  const bg = loadBranchGold();
  const BRANCH_ORDER = ["crisis", "suspected", "gentle_check", "normal", "diagnosis", "medication", "medical_redflag"];
  const pipeArms = ["pipeline_fast", "pipeline_deep"].filter((a) => arms[a]);
  const branchStat: Record<string, { total: { hit: number; n: number }; by: Record<string, { hit: number; n: number }> }> = {};
  for (const a of pipeArms) {
    const scored = (arms[a] as any[]).map((r) => {
      const g = bg.get(`${r.id}#${r.turn}`);
      return { expected: (g?.expected ?? "?") as string, okB: !r.error && r.prediction !== null && g ? (r.branch === g.expected || g.acceptable.includes(r.branch)) : false };
    });
    const by: Record<string, { hit: number; n: number }> = {};
    for (const r of scored) { by[r.expected] = by[r.expected] || { hit: 0, n: 0 }; by[r.expected].n++; if (r.okB) by[r.expected].hit++; }
    branchStat[a] = { total: { hit: scored.filter((r) => r.okB).length, n: scored.length }, by };
  }
  lines.push("## 表 6-B · 干预路由质量(仅管线)", "",
    "正确目标 = `expected_branch`(7 类,含 `acceptable_branches` 可接受分支口径);此表衡量路由系统本身,不做 4 类压缩投影。", "");
  const cellB = (a: string, e: string) => { const v = branchStat[a]?.by[e]; return v ? `${v.hit}/${v.n}(${(v.hit / v.n * 100).toFixed(1)}%)` : "—"; };
  lines.push(`| expected_branch | ${pipeArms.map((a) => ARM_LABEL[a] ?? a).join(" | ")} |`,
    `|---|${pipeArms.map(() => "---").join("|")}|`,
    `| **总分支命中率** | ${pipeArms.map((a) => { const t = branchStat[a].total; return `**${t.hit}/${t.n}(${(t.hit / t.n * 100).toFixed(1)}%)**`; }).join(" | ")} |`);
  for (const e of BRANCH_ORDER) lines.push(`| ${e} | ${pipeArms.map((a) => cellB(a, e)).join(" | ")} |`);
  lines.push("");

  // ---------- 单臂 4 类 P/R/F1(判官 / 词表 / 基线,主文原位) ----------
  lines.push("## 单臂 4 类 P/R/F1(判官 / 词表 / 基线)", "");
  for (const arm of ["judge", "lexicon", "baseline_deepseek"].filter((a) => arms[a])) {
    push4ClassSection(lines, arm, arms[arm], stats[arm]);
  }

  // ---------- 附录:passive 实际路由 + 管线 4 类投影 ----------
  lines.push("---", "", "## 附录:passive 实际路由与管线 4 类投影", "");
  const passiveUnits = loadUnits().filter((u) => u.gold === "passive_ideation");
  const suspN = passiveUnits.filter((u) => bg.get(`${u.id}#${u.turn}`)?.expected === "suspected").length;
  const gcN = passiveUnits.filter((u) => bg.get(`${u.id}#${u.turn}`)?.expected === "gentle_check").length;
  const passiveBreakdown = (arm: string) => {
    const rows = (arms[arm] ?? []).filter((r) => r.gold === "passive_ideation");
    const counts = new Map<string, number>();
    for (const row of rows) {
      const expected = bg.get(`${row.id}#${row.turn}`)?.expected ?? "unknown";
      const actual = row.branch ?? "missing";
      const key = `${expected}→${actual}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const released = rows.filter((r) => !r.prediction || r.prediction === "none").length;
    const intervened = rows.length - released;
    return { rows, counts, released, intervened };
  };
  const passiveByArm = Object.fromEntries(pipeArms.map((arm) => [arm, passiveBreakdown(arm)]));
  lines.push(
    `passive 金标共 ${passiveUnits.length} 条；数据设计中 ${suspN} 条期望 \`suspected\`、${gcN} 条期望 \`gentle_check\`。这个 30/30 是**预设分层**，不能直接当作模型错误成因。下面按实际输出计数：`, "",
    `| 臂 | 实际干预 | 实际放行 | 期望→实际分支 |`,
    `|---|---:|---:|---|`);
  for (const arm of pipeArms) {
    const x = passiveByArm[arm];
    lines.push(`| ${ARM_LABEL[arm]} | ${x.intervened}/${x.rows.length}(${(x.intervened / x.rows.length * 100).toFixed(1)}%) | ${x.released}/${x.rows.length}(${(x.released / x.rows.length * 100).toFixed(1)}%) | ${[...x.counts].sort().map(([key, n]) => `${key} ${n}`).join("；")} |`);
  }
  lines.push("",
    "当前 gentle_check 映射为 passive_ideation；其余分支映射以冻结源码为准。**是否干预依据实际 branch/prediction 逐行统计**，" +
    "不能把 30 条 expected=suspected 自动称为“结构假象”，也不能把 30 条 expected=gentle_check 自动称为“真实漏检”。", "");
  for (const arm of pipeArms) push4ClassSection(lines, arm, arms[arm], stats[arm]);
  const outMd = join(REPORTS, "detection_arms.md");
  writeFileSync(outMd, lines.join("\n"));
  console.log(`报告 → ${outMd}`);
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const arm = get("--arm", "report");
  const limit = Number(get("--limit", "0"));
  runId = get("--run-id", "");
  if (![...RUN_ARMS, "report"].includes(arm) || !Number.isInteger(limit) || limit < 0 || get("--concurrency", "1") !== "1") {
    throw new Error("无效参数；四臂统一 --concurrency 1，--limit 必须为非负整数");
  }
  if (!runId) {
    if (arm !== "report") throw new Error("执行评测必须显式传 --run-id，不能追加历史结果");
    console.log(readFileSync(join(HERE, "../reports/detection_arms.md"), "utf8"));
    return;
  }
  const paths = runPaths(APP_ROOT, runId);
  const release = acquireRunLock(APP_ROOT, runId);
  const stop = () => { release(); process.exit(130); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop); process.once("exit", release);
  try {
    assertKnownRun(paths, arm !== "report");
    OUT = paths.results; REPORTS = paths.reports;
    const snapshot = inputSnapshot(APP_ROOT, DATASET_DIRS);
    if (arm === "report") {
      const stored = JSON.parse(readFileSync(paths.manifest, "utf8"));
      freezeManifest(paths, { ...stored.protocol, inputs: snapshot });
      return report();
    }
    setupEvalEnv({ appRoot: APP_ROOT, workdir: paths.workdir });
    const kimi = getKimiConfig(), deepseek = getDeepSeekConfig();
    const model = (name: string) => {
      const p = buildDeepSeekPayload({ systemPrompt: "", messages: [], apiModel: name });
      return { model: p.model, thinking: p.thinking, temperature: p.temperature, maxTokens: p.max_tokens };
    };
    freezeManifest(paths, {
      runId, scope: "local-POST-synthetic-seed", inputs: snapshot, concurrency: 1,
      judge: { primary: resolveJudgePrimary(), provider: kimi.provider, origin: new URL(kimi.baseUrl).origin, model: kimi.model, configured: Boolean(kimi.apiKey), timeoutMs: 30000, fastTimeoutMs: 5000, blockingTimeoutMs: 12000 },
      generator: { origin: new URL(deepseek.baseUrl).origin, configured: Boolean(deepseek.apiKey), fast: model("deepseek-v4-flash"), deep: model("deepseek-v4-pro") },
      credentials: process.env.EVAL_ALLOW_PRODUCTION_KEYS === "1" ? "explicit-production-override" : "dedicated-eval-only",
    });
    if (arm !== "lexicon") requireJudge();
    if (arm.startsWith("pipeline")) requireDeepSeek();
    await runArm(arm, limit);
  } finally {
    release(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); process.removeListener("exit", release);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
