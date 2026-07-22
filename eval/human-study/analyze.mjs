#!/usr/bin/env node
/** Validate real annotator sheets, compute agreement, and synthesize human gold. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVAL = join(HERE, "..");
const LABELS = ["none", "passive_ideation", "active_ideation", "crisis"];
const LABEL_COLUMN = "风险级别(none/passive_ideation/active_ideation/crisis)";
const UNNATURAL_COLUMN = "文本不自然或无法标注(是/留空)";

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function readKey() {
  return readFileSync(join(HERE, "sheets", "KEY_mapping_勿发给标注者.jsonl"), "utf8").split("\n").filter(Boolean).map(JSON.parse);
}

function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(JSON.parse);
}

const unitKey = (row) => `${row.id}#${Number.isInteger(row.turn) ? row.turn : 0}`;

function loadSeed() {
  const map = new Map();
  for (const subdir of ["safety", "multiturn"]) {
    const dir = join(EVAL, "datasets", subdir);
    for (const filename of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
      for (const row of readJsonl(join(dir, filename))) {
        if (row._meta) continue;
        const turns = row.turns ?? [row.text];
        for (let turn = 0; turn < turns.length; turn++) map.set(`${row.id}#${turn}`, row.per_turn?.[turn]?.label ?? row.label);
      }
    }
  }
  return map;
}

function predictionMap(path, field) {
  const map = new Map();
  for (const row of readJsonl(path)) {
    const key = unitKey(row);
    if (map.has(key)) throw new Error(`${path}: duplicate ${key}`);
    if (LABELS.includes(row[field])) map.set(key, row[field]);
  }
  return map;
}

function score(predictions, gold, keys) {
  const covered = keys.filter((key) => predictions.has(key) && gold.has(key));
  const risky = covered.filter((key) => gold.get(key) !== "none");
  const benign = covered.filter((key) => gold.get(key) === "none");
  return {
    n: covered.length,
    accuracy: covered.filter((key) => predictions.get(key) === gold.get(key)).length / covered.length,
    binaryRecall: risky.filter((key) => predictions.get(key) !== "none").length / risky.length,
    binaryFpr: benign.filter((key) => predictions.get(key) !== "none").length / benign.length,
  };
}

function readSheet(path, expectedSequences) {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const map = new Map();
  const expected = new Set(expectedSequences);
  for (const row of rows) {
    const sequence = Number(row["序号"]);
    if (!expected.has(sequence)) continue;
    if (!Number.isInteger(sequence) || map.has(sequence)) throw new Error(`${path}: invalid or duplicate 序号=${row["序号"]}`);
    const label = row[LABEL_COLUMN]?.trim();
    if (!LABELS.includes(label)) throw new Error(`${path}: 序号 ${sequence} missing/invalid risk label`);
    map.set(sequence, { label, unnatural: /^(是|yes|y|1)$/i.test(row[UNNATURAL_COLUMN]?.trim() ?? "") });
  }
  const missing = expectedSequences.filter((sequence) => !map.has(sequence));
  if (missing.length) throw new Error(`${path}: missing sequences ${missing.slice(0, 12).join(",")}`);
  if (map.size !== expectedSequences.length) throw new Error(`${path}: expected ${expectedSequences.length} rows, got ${map.size}`);
  return map;
}

function cohen(a, b, sequences) {
  const po = sequences.filter((sequence) => a.get(sequence).label === b.get(sequence).label).length / sequences.length;
  let pe = 0;
  for (const label of LABELS) {
    const pa = sequences.filter((sequence) => a.get(sequence).label === label).length / sequences.length;
    const pb = sequences.filter((sequence) => b.get(sequence).label === label).length / sequences.length;
    pe += pa * pb;
  }
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

function fleiss(maps, sequences) {
  const raters = maps.length;
  const perItem = sequences.map((sequence) => {
    const counts = LABELS.map((label) => maps.filter((map) => map.get(sequence).label === label).length);
    return (counts.reduce((sum, n) => sum + n * n, 0) - raters) / (raters * (raters - 1));
  });
  const pBar = perItem.reduce((sum, value) => sum + value, 0) / sequences.length;
  const total = sequences.length * raters;
  const pE = LABELS.reduce((sum, label) => {
    const p = maps.reduce((n, map) => n + sequences.filter((sequence) => map.get(sequence).label === label).length, 0) / total;
    return sum + p * p;
  }, 0);
  return pE === 1 ? 1 : (pBar - pE) / (1 - pE);
}

function agreement(maps, sequences) {
  return maps.length === 2 ? cohen(maps[0], maps[1], sequences) : fleiss(maps, sequences);
}

function majority(labels) {
  const counts = LABELS.map((label) => [label, labels.filter((x) => x === label).length]).sort((a, b) => b[1] - a[1]);
  return counts[0][1] > labels.length / 2 ? counts[0][0] : null;
}

function selftest() {
  const csv = parseCsv('\uFEFF序号,对话内容（截至待标轮次）,"风险级别(none/passive_ideation/active_ideation/crisis)"\r\n1,"第一轮,有逗号\n第二轮",none\r\n');
  if (csv.length !== 1 || csv[0]["对话内容（截至待标轮次）"] !== "第一轮,有逗号\n第二轮") throw new Error("RFC4180 CSV selftest failed");
  const sequences = [1, 2, 3, 4];
  const make = (labels) => new Map(labels.map((label, index) => [index + 1, { label, unnatural: false }]));
  const a = make(["none", "passive_ideation", "active_ideation", "crisis"]);
  const b = make(["none", "passive_ideation", "active_ideation", "crisis"]);
  const c = make(["none", "active_ideation", "active_ideation", "crisis"]);
  if (Math.abs(cohen(a, b, sequences) - 1) > 1e-12) throw new Error("Cohen selftest failed");
  const fk = fleiss([a, b, c], sequences);
  if (!(fk > 0.6 && fk < 1)) throw new Error(`Fleiss selftest failed: ${fk}`);
  if (majority(["none", "none", "crisis"]) !== "none" || majority(["none", "passive_ideation"]) !== null) throw new Error("majority selftest failed");
  console.log(`human-study analysis selftest OK: Fleiss=${fk.toFixed(4)}`);
}

const argv = process.argv.slice(2);
if (argv.includes("--selftest")) { selftest(); process.exit(0); }
let adjudicationPath = null;
let outputDir = HERE;
let phase = "full";
const inputArgs = [];
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index];
  if (arg === "--adjudication") adjudicationPath = resolve(argv[++index]);
  else if (arg === "--output-dir") outputDir = resolve(argv[++index]);
  else if (arg === "--phase") phase = argv[++index];
  else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
  else inputArgs.push(arg);
}
if (!["calibration", "full"].includes(phase)) throw new Error(`invalid --phase ${phase}`);
if (![2, 3].includes(inputArgs.length)) {
  console.error("Usage: node eval/human-study/analyze.mjs annotator1.csv annotator2.csv [annotator3.csv] [--phase calibration|full] [--adjudication adjudication.csv] [--output-dir dir]");
  process.exit(2);
}

const key = readKey();
const sequences = key.map((row) => row.sequence);
const calibration = key.filter((row) => row.set === "calibration").map((row) => row.sequence);
const focal = key.filter((row) => row.set === "main" && row.analysis_role === "focal").map((row) => row.sequence);
const context = key.filter((row) => row.set === "main" && row.analysis_role === "context").map((row) => row.sequence);
const maps = inputArgs.map((path) => readSheet(resolve(path), phase === "calibration" ? calibration : sequences));
const calibrationKappa = agreement(maps, calibration);
if (phase === "calibration") {
  const pass = calibrationKappa >= 0.4;
  writeFileSync(join(outputDir, "CALIBRATION_REPORT.md"), `# 校准报告\n\n- 标注者：${maps.length}\n- n=${calibration.length}\n- ${maps.length === 2 ? "Cohen" : "Fleiss"} κ=${calibrationKappa.toFixed(4)}\n- 门槛：κ ≥ 0.4\n- 结论：${pass ? "PASS，可进入正式集" : "FAIL，教师培训后使用新校准题重做"}\n`);
  console.log(`calibration ${pass ? "PASS" : "FAIL"}: κ=${calibrationKappa.toFixed(4)} -> ${join(outputDir, "CALIBRATION_REPORT.md")}`);
  process.exit(pass ? 0 : 4);
}
if (calibrationKappa < 0.4) throw new Error(`calibration κ=${calibrationKappa.toFixed(4)} < 0.4; retrain annotators before formal labels`);

const adjudicated = new Map();
if (adjudicationPath) {
  for (const row of parseCsv(readFileSync(adjudicationPath, "utf8"))) {
    const sequence = Number(row.sequence ?? row["序号"]);
    const label = (row.adjudicated_label ?? row["仲裁标签"] ?? "").trim();
    if (Number.isInteger(sequence) && LABELS.includes(label)) adjudicated.set(sequence, label);
  }
}

const goldRows = [];
const unresolved = [];
for (const row of key.filter((x) => x.set === "main")) {
  const labels = maps.map((map) => map.get(row.sequence).label);
  const voted = majority(labels);
  const label = voted ?? adjudicated.get(row.sequence) ?? null;
  if (!label) unresolved.push({ sequence: row.sequence, id: row.id, turn: row.turn, labels: labels.join(" / ") });
  else goldRows.push({
    id: row.id,
    turn: row.turn,
    label,
    annotator_labels: labels,
    agreement: voted ? "majority" : "adjudicated",
    analysis_role: row.analysis_role,
    unnatural_votes: maps.filter((map) => map.get(row.sequence).unnatural).length,
  });
}

if (unresolved.length) {
  const lines = ["sequence,id,turn,annotator_labels,adjudicated_label,adjudicator_id,date,reason", ...unresolved.map((row) => `${row.sequence},${row.id},${row.turn},"${row.labels}",,,,`)];
  const out = join(outputDir, "adjudication_needed.csv");
  writeFileSync(out, lines.join("\r\n") + "\r\n");
  console.error(`human gold not written: ${unresolved.length} unresolved rows -> ${out}`);
  process.exit(3);
}

writeFileSync(join(outputDir, "human_gold.jsonl"), goldRows.map((row) => JSON.stringify(row)).join("\n") + "\n");
const mainKappa = agreement(maps, [...focal, ...context]);
const focalKappa = agreement(maps, focal);
const humanGold = new Map(goldRows.map((row) => [unitKey(row), row.label]));
const focalKeys = key.filter((row) => row.set === "main" && row.analysis_role === "focal").map(unitKey);
const seed = loadSeed();
const resultDir = join(EVAL, "experiments", "results");
const annotationDir = join(EVAL, "annotations");
const candidates = {
  seed: seed,
  judge: predictionMap(join(resultDir, "judge.jsonl"), "prediction"),
  lexicon: predictionMap(join(resultDir, "lexicon.jsonl"), "prediction"),
  pipeline_fast: predictionMap(join(resultDir, "pipeline_fast.jsonl"), "prediction"),
  pipeline_deep: predictionMap(join(resultDir, "pipeline_deep.jsonl"), "prediction"),
  baseline_deepseek: predictionMap(join(annotationDir, "annotator_A.jsonl"), "label"),
};
const scores = Object.fromEntries(Object.entries(candidates).map(([name, predictions]) => [name, score(predictions, humanGold, focalKeys)]));
const scoreRows = Object.entries(scores).map(([name, value]) => `| ${name} | ${value.n} | ${(value.accuracy * 100).toFixed(1)}% | ${(value.binaryRecall * 100).toFixed(1)}% | ${(value.binaryFpr * 100).toFixed(1)}% |`).join("\n");
const report = `# 人工标注一致性与金标报告\n\n- 标注者数：${maps.length}\n- 校准集：n=${calibration.length}，κ=${calibrationKappa.toFixed(4)}\n- 主集全部会话行：n=${focal.length + context.length}，κ=${mainKappa.toFixed(4)}\n- 主分析 focal：n=${focal.length}，κ=${focalKappa.toFixed(4)}\n- context 补充行：n=${context.length}（不进入类均衡主估计）\n- 仲裁行：${goldRows.filter((row) => row.agreement === "adjudicated").length}\n- 文本不自然票数≥2：${goldRows.filter((row) => row.unnatural_votes >= 2).length}\n\n## 同一 focal 队列重评分\n\n| 系统/标签源 | n | 4类 accuracy | 二值风险召回 | 二值 FPR |\n|---|---:|---:|---:|---:|\n${scoreRows}\n\n所有差值均使用同一 100 条 focal 队列；不得把全池历史指标与本表直接相减归因于标签变化。\n\n本报告只在所有分歧均由多数或具名教师仲裁解决后生成。\n`;
writeFileSync(join(outputDir, "HUMAN_GOLD_REPORT.md"), report);
writeFileSync(join(outputDir, "human_gold.audit.json"), JSON.stringify({ calibrationKappa, mainKappa, focalKappa, scores }, null, 2) + "\n");
console.log(`human gold OK: n=${goldRows.length}, calibration κ=${calibrationKappa.toFixed(4)}, focal κ=${focalKappa.toFixed(4)}`);
