/**
 * eval/experiments/detection_arms.ts — 三条检测臂 vs 纯 DeepSeek 基线(阶段 4)
 *
 * 按 eval/EXPERIMENT_SPEC.md;2026-07-08 因中转站 503 由本地实现(原计划 Codex)。
 * 金标 = 数据集种子 label(4 类;多轮取 per_turn[i].label)。
 *
 * 臂:
 *   lexicon        runWordlistOnly(history)            本地词表,瞬间
 *   judge          runJudgeOnly(history)               Kimi 语义判官(并发≤2,resume)
 *   pipeline_fast  runFullPipeline(mode=fast)          全管线快速档(真调 DeepSeek+尾部判官)
 *   pipeline_deep  runFullPipeline(mode=deep)          全管线深度档(阻塞判官)
 *   baseline       纯 deepseek-chat 零样本 4 类分类 —— 与标注员 A 同一协议,直接复用
 *                  eval/annotations/annotator_A.jsonl 的输出(报告中注明)。
 *
 * 用法: npx tsx eval/experiments/detection_arms.ts --arm lexicon|judge|pipeline_fast|pipeline_deep|report [--limit N] [--concurrency C]
 *   resume 永远开启(结果 jsonl 已有 id#turn 跳过);--arm report 汇总全部已有结果出 MD。
 */
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setupEvalEnv } from "../adapters/env";
import { runWordlistOnly } from "../adapters/wordlist";
import { runJudgeOnly } from "../adapters/judge";
import { runFullPipeline } from "../adapters/pipeline";
import { labelFromBranch } from "../adapters/label-maps";
import type { UnifiedLabel, Branch } from "../adapters/result";

setupEvalEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const DS = join(HERE, "..", "datasets");
const OUT = join(HERE, "results");
const REPORTS = join(HERE, "..", "reports");
const LABELS: UnifiedLabel[] = ["none", "passive_ideation", "active_ideation", "crisis"];

type Unit = { id: string; turn: number; history: string[]; gold: UnifiedLabel };

function loadUnits(): Unit[] {
  const units: Unit[] = [];
  for (const dir of [join(DS, "safety"), join(DS, "multiturn")]) {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runArm(arm: string, limit: number, conc: number) {
  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, `${arm}.jsonl`);
  const done = new Set<string>();
  if (existsSync(outPath)) {
    for (const l of readFileSync(outPath, "utf8").split("\n")) {
      if (!l.trim()) continue;
      const r = JSON.parse(l);
      done.add(`${r.id}#${r.turn}`);
    }
  }
  let units = loadUnits().filter((u) => !done.has(`${u.id}#${u.turn}`));
  const total = units.length + done.size;
  if (limit > 0) units = units.slice(0, limit);
  console.log(`[${arm}] 单元=${total} 已完成=${done.size} 本次=${units.length} 并发=${conc}`);

  let idx = 0, okc = 0, errc = 0;
  async function one(u: Unit) {
    const t0 = Date.now();
    try {
      let prediction: UnifiedLabel | null = null;
      let branch: Branch | null = null;
      let route: string | null = null;
      if (arm === "lexicon") {
        const r = runWordlistOnly(u.history);
        prediction = r.prediction as UnifiedLabel; branch = r.branch;
      } else if (arm === "judge") {
        const r = await runJudgeOnly(u.history, { timeoutMs: 30000 });
        prediction = (r.prediction as UnifiedLabel) ?? null; branch = r.branch;
      } else if (arm === "pipeline_fast" || arm === "pipeline_deep") {
        const r = await runFullPipeline(u.history.map((c) => ({ role: "user" as const, content: c })), {
          mode: arm === "pipeline_deep" ? "deep" : "fast",
        });
        branch = r.branch; route = r.route ?? null;
        prediction = labelFromBranch(r.branch);
      } else throw new Error(`unknown arm ${arm}`);
      appendFileSync(outPath, JSON.stringify({
        id: u.id, turn: u.turn, gold: u.gold, prediction, branch, route,
        ok: prediction === u.gold, ms: Date.now() - t0,
      }) + "\n");
      okc++;
    } catch (e) {
      errc++;
      console.log(`  ✗ ${u.id}#${u.turn} ${(e as Error).message?.slice(0, 80)}`);
      await sleep(2000);
    }
  }
  async function worker() {
    while (idx < units.length) { const u = units[idx++]; await one(u); if ((okc + errc) % 25 === 0) console.log(`  ${done.size + okc + errc}/${total} err=${errc}`); }
  }
  await Promise.all(Array.from({ length: Math.min(conc, Math.max(1, units.length)) }, worker));
  console.log(`[${arm}] 完成:+${okc} 失败=${errc} 累计=${done.size + okc}/${total} → ${outPath}`);
}

// ---------- 汇总 ----------
type Row = { id: string; turn: number; gold: UnifiedLabel; prediction: UnifiedLabel | null };
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
  for (const dir of [join(DS, "safety"), join(DS, "multiturn")]) {
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

function report() {
  mkdirSync(REPORTS, { recursive: true });
  const arms: Record<string, Row[]> = {};
  for (const f of existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith(".jsonl")) : []) {
    arms[f.replace(".jsonl", "")] = readFileSync(join(OUT, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
  // baseline = annotator_A 输出(同协议纯 DeepSeek 零样本),join 金标
  const annPath = join(HERE, "..", "annotations", "annotator_A.jsonl");
  if (existsSync(annPath)) {
    const goldByKey = new Map(loadUnits().map((u) => [`${u.id}#${u.turn}`, u.gold]));
    arms["baseline_deepseek"] = readFileSync(annPath, "utf8").split("\n").filter(Boolean).map((l) => {
      const r = JSON.parse(l);
      return { id: r.id, turn: r.turn, gold: goldByKey.get(`${r.id}#${r.turn}`)!, prediction: r.label };
    }).filter((r) => r.gold);
  }
  const lines: string[] = ["# 三臂检测 vs 纯 DeepSeek 基线 — 分类别 P/R/F1", "",
    `金标 = 数据集种子 label(4 类,多轮取 per_turn);单元 = id#turn。`,
    `baseline_deepseek = 与标注员 A 同一协议的纯 deepseek-chat 零样本(复用其输出)。`, ""];
  for (const [arm, rows] of Object.entries(arms)) {
    const s = prf(rows);
    lines.push(`## ${arm}(n=${s.n})`, "",
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
  // 管线臂的正确评分对象:expected_branch(7 类,含 acceptable_branches)——
  // 数据集为干预路由设计的金标;4 类表格对管线是映射压缩后的参考。
  const bg = loadBranchGold();
  for (const arm of ["pipeline_fast", "pipeline_deep"]) {
    const rows = arms[arm];
    if (!rows) continue;
    const scored = (rows as any[]).map((r) => {
      const g = bg.get(`${r.id}#${r.turn}`);
      const okB = g ? (r.branch === g.expected || g.acceptable.includes(r.branch)) : false;
      return { ...r, expected: g?.expected, okB };
    });
    const accB = scored.filter((r) => r.okB).length / scored.length;
    lines.push(`## ${arm} — 分支级评分(正确目标:expected_branch,含可接受分支)`, "",
      `分支命中率:${(accB * 100).toFixed(1)}%(n=${scored.length})`, "",
      `| expected_branch | 命中/总数 | 命中率 |`, `|---|---|---|`);
    const byExp: Record<string, { hit: number; n: number }> = {};
    for (const r of scored) {
      const e = r.expected ?? "?";
      byExp[e] = byExp[e] || { hit: 0, n: 0 };
      byExp[e].n++; if (r.okB) byExp[e].hit++;
    }
    for (const [e, v] of Object.entries(byExp).sort()) lines.push(`| ${e} | ${v.hit}/${v.n} | ${(v.hit / v.n * 100).toFixed(1)}% |`);
    lines.push("");
  }
  const outMd = join(REPORTS, "detection_arms.md");
  writeFileSync(outMd, lines.join("\n"));
  console.log(`报告 → ${outMd}`);
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const arm = get("--arm", "report");
  const limit = Number(get("--limit", "0"));
  const conc = Number(get("--concurrency", arm === "lexicon" ? "1" : arm === "judge" ? "2" : "4"));
  if (arm === "report") return report();
  await runArm(arm, limit, conc);
}

main().catch((e) => { console.error(e); process.exit(1); });
