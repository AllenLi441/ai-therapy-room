/**
 * Cohen's κ(一致性系数)—— 供阶段 2 安全测试集的双人标注复核使用。
 *
 * 用法:
 *   npx tsx eval/metrics/kappa.ts <标注A.jsonl> <标注B.jsonl> [--field label] [--out report.md]
 *
 * 标注行格式:{"id":"sft-0901","turn":2,"label":"active_ideation"}
 *   - 单轮样例 turn 可省略或为 null;标注单元键 = `${id}#${turn ?? 0}`。
 *   - --field 默认 "label"(4 类);也支持 --field expected_branch(7 类)。
 *
 * 只对两文件共有的标注单元计算;κ = (po - pe) / (1 - pe);
 * pe = 1(退化,通常发生于两人标注完全相同且单一类别)时,输出 κ = 1 并注明退化。
 * 无浮点随机性,无需 seed。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LABEL_CATEGORIES = ["none", "passive_ideation", "active_ideation", "crisis"];
const BRANCH_CATEGORIES = [
  "normal",
  "gentle_check",
  "suspected",
  "crisis",
  "medication",
  "diagnosis",
  "medical_redflag"
];

type Row = Record<string, unknown>;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let field = "label";
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--field") {
      field = argv[++i];
    } else if (a === "--out") {
      out = argv[++i];
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    console.error(
      "用法: npx tsx eval/metrics/kappa.ts <标注A.jsonl> <标注B.jsonl> [--field label] [--out report.md]"
    );
    process.exit(1);
  }
  return { fileA: positional[0], fileB: positional[1], field, out };
}

function readAnnotations(path: string, field: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    let row: Row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row._meta !== undefined) continue; // 兼容误传数据集文件的情况
    const id = row.id;
    if (typeof id !== "string") continue;
    const turn = row.turn;
    const unitKey = `${id}#${typeof turn === "number" ? turn : 0}`;
    const value = row[field];
    if (typeof value === "string") map.set(unitKey, value);
  }
  return map;
}

/** 扫 eval/datasets/{safety,multiturn}/*.jsonl,建立 id → 类别(数据集文件类别)映射,
 *  供按 category 分解的 κ 表使用。独立实现,不 import validate-datasets.ts。 */
function readIdToCategory(): Map<string, string> {
  const idToCategory = new Map<string, string>();
  for (const dir of ["safety", "multiturn"]) {
    const dirPath = join(process.cwd(), "eval/datasets", dir);
    let files: string[];
    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const filename of files) {
      const lines = readFileSync(join(dirPath, filename), "utf8")
        .split("\n")
        .filter((l) => l.trim().length > 0);
      for (const line of lines) {
        let row: Row;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        if (row._meta !== undefined) continue;
        if (typeof row.id === "string" && typeof row.category === "string") {
          idToCategory.set(row.id, row.category);
        }
      }
    }
  }
  return idToCategory;
}

type KappaResult = { n: number; po: number; pe: number; kappa: number; degenerate: boolean };

function computeKappa(
  a: Map<string, string>,
  b: Map<string, string>,
  units: string[],
  categories: string[]
): KappaResult {
  const catSet = new Set(categories);
  const marginalA = new Map<string, number>();
  const marginalB = new Map<string, number>();
  let agree = 0;
  for (const unit of units) {
    const va = a.get(unit)!;
    const vb = b.get(unit)!;
    if (catSet.has(va)) marginalA.set(va, (marginalA.get(va) ?? 0) + 1);
    if (catSet.has(vb)) marginalB.set(vb, (marginalB.get(vb) ?? 0) + 1);
    if (va === vb) agree += 1;
  }
  const n = units.length;
  if (n === 0) return { n: 0, po: 0, pe: 0, kappa: 0, degenerate: true };
  const po = agree / n;
  let pe = 0;
  for (const cat of categories) {
    const pa = (marginalA.get(cat) ?? 0) / n;
    const pb = (marginalB.get(cat) ?? 0) / n;
    pe += pa * pb;
  }
  const degenerate = 1 - pe === 0;
  const kappa = degenerate ? 1 : (po - pe) / (1 - pe);
  return { n, po, pe, kappa, degenerate };
}

function landisKoch(kappa: number): string {
  if (kappa < 0) return "Poor(差)";
  if (kappa <= 0.2) return "Slight(轻微)";
  if (kappa <= 0.4) return "Fair(尚可)";
  if (kappa <= 0.6) return "Moderate(中等)";
  if (kappa <= 0.8) return "Substantial(高度)";
  return "Almost Perfect(几乎完全一致)";
}

function main(): void {
  const { fileA, fileB, field, out } = parseArgs(process.argv.slice(2));
  const categories = field === "expected_branch" ? BRANCH_CATEGORIES : LABEL_CATEGORIES;

  const a = readAnnotations(fileA, field);
  const b = readAnnotations(fileB, field);
  const commonUnits = [...a.keys()].filter((k) => b.has(k));

  const overall = computeKappa(a, b, commonUnits, categories);
  const idToCategory = readIdToCategory();

  const byCategory = new Map<string, string[]>();
  for (const unit of commonUnits) {
    const id = unit.split("#")[0];
    const cat = idToCategory.get(id) ?? "(未知类别)";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(unit);
  }

  const lines: string[] = [];
  lines.push(`# Cohen's κ 报告`);
  lines.push("");
  lines.push(`- 标注 A: \`${fileA}\``);
  lines.push(`- 标注 B: \`${fileB}\``);
  lines.push(`- 字段: \`${field}\`(${categories.length} 类)`);
  lines.push("");
  lines.push(`## 总体`);
  lines.push("");
  lines.push(`| n | po | pe | κ | 解读 |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  lines.push(
    `| ${overall.n} | ${overall.po.toFixed(4)} | ${overall.pe.toFixed(4)} | ${overall.kappa.toFixed(4)}${
      overall.degenerate ? "(退化:pe=1)" : ""
    } | ${landisKoch(overall.kappa)} |`
  );
  if (overall.degenerate) {
    lines.push("");
    lines.push("> 退化说明:pe = 1(两位标注者的边际分布集中于单一类别),按约定输出 κ = 1。");
  }
  lines.push("");
  lines.push(`## 按类别分解`);
  lines.push("");
  lines.push(`| category | n | po | pe | κ | 解读 |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const cat of [...byCategory.keys()].sort()) {
    const units = byCategory.get(cat)!;
    const r = computeKappa(a, b, units, categories);
    lines.push(
      `| ${cat} | ${r.n} | ${r.po.toFixed(4)} | ${r.pe.toFixed(4)} | ${r.kappa.toFixed(4)}${
        r.degenerate ? "(退化)" : ""
      } | ${landisKoch(r.kappa)} |`
    );
  }
  lines.push("");

  const report = lines.join("\n");
  if (out) {
    writeFileSync(out, report, "utf8");
    console.log(`已写入 ${out}`);
  } else {
    console.log(report);
  }
}

main();
