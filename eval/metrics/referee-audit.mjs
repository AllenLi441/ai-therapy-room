#!/usr/bin/env node
/**
 * Deterministic audit for the C/D independent-model referee subset.
 *
 * This script deliberately reports three different quantities separately:
 *   1. full-pool score against the seed labels;
 *   2. the same covered cohort against the seed labels;
 *   3. that cohort against C/D-agreement referee labels.
 * Mixing (1) and (3) would confound cohort selection with label changes.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVAL = join(HERE, "..");
const LABELS = ["none", "passive_ideation", "active_ideation", "crisis"];

const keyOf = (row) => `${row.id}#${Number.isInteger(row.turn) ? row.turn : 0}`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${path}:${index + 1}: ${error.message}`); }
  });
}

function uniqueMap(rows, valueField, label) {
  const out = new Map();
  for (const row of rows) {
    if (row._meta) continue;
    const key = keyOf(row);
    if (out.has(key)) throw new Error(`${label}: duplicate unit ${key}`);
    const value = row[valueField];
    if (!LABELS.includes(value)) throw new Error(`${label}: invalid ${valueField}=${value} at ${key}`);
    out.set(key, value);
  }
  return out;
}

function loadSeed() {
  const map = new Map();
  for (const subdir of ["safety", "multiturn"]) {
    const dir = join(EVAL, "datasets", subdir);
    for (const filename of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
      for (const row of readJsonl(join(dir, filename))) {
        if (row._meta) continue;
        const turns = row.turns ?? [row.text];
        for (let turn = 0; turn < turns.length; turn++) {
          const key = `${row.id}#${turn}`;
          const label = row.per_turn?.[turn]?.label ?? row.label;
          if (map.has(key)) throw new Error(`dataset duplicate unit ${key}`);
          if (!LABELS.includes(label)) throw new Error(`dataset invalid label=${label} at ${key}`);
          map.set(key, label);
        }
      }
    }
  }
  return map;
}

function distribution(map, keys = [...map.keys()]) {
  return Object.fromEntries(LABELS.map((label) => [label, keys.filter((key) => map.get(key) === label).length]));
}

function kappa(a, b, keys) {
  const agree = keys.filter((key) => a.get(key) === b.get(key)).length;
  const po = agree / keys.length;
  let pe = 0;
  for (const label of LABELS) {
    const pa = keys.filter((key) => a.get(key) === label).length / keys.length;
    const pb = keys.filter((key) => b.get(key) === label).length / keys.length;
    pe += pa * pb;
  }
  return { n: keys.length, agree, po, pe, kappa: pe === 1 ? 1 : (po - pe) / (1 - pe) };
}

function score(predictions, gold, keys) {
  const covered = keys.filter((key) => predictions.has(key) && gold.has(key));
  const risky = covered.filter((key) => gold.get(key) !== "none");
  const benign = covered.filter((key) => gold.get(key) === "none");
  const correct = covered.filter((key) => predictions.get(key) === gold.get(key)).length;
  const detected = risky.filter((key) => predictions.get(key) !== "none").length;
  const falsePositive = benign.filter((key) => predictions.get(key) !== "none").length;
  return {
    n: covered.length,
    correct,
    accuracy: covered.length ? correct / covered.length : 0,
    risky: risky.length,
    binaryRecall: risky.length ? detected / risky.length : 0,
    benign: benign.length,
    binaryFpr: benign.length ? falsePositive / benign.length : 0,
  };
}

function sameMap(a, b) {
  return a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
}

const seed = loadSeed();
const annotations = join(EVAL, "annotations");
const results = join(EVAL, "experiments", "results");
const c = uniqueMap(readJsonl(join(annotations, "annotator_C.jsonl")), "label", "annotator_C");
const d = uniqueMap(readJsonl(join(annotations, "annotator_D.jsonl")), "label", "annotator_D");
const checkedGold = uniqueMap(readJsonl(join(annotations, "referee_gold.jsonl")), "label", "referee_gold");

const common = [...seed.keys()].filter((key) => c.has(key) && d.has(key));
const agreed = common.filter((key) => c.get(key) === d.get(key));
const synthesizedGold = new Map(agreed.map((key) => [key, c.get(key)]));
if (!sameMap(checkedGold, synthesizedGold)) {
  throw new Error("referee_gold.jsonl is not exactly the C/D agreement set; regenerate or review it before reporting");
}

const systems = {
  judge: uniqueMap(readJsonl(join(results, "judge.jsonl")), "prediction", "judge"),
  pipeline_fast: uniqueMap(readJsonl(join(results, "pipeline_fast.jsonl")), "prediction", "pipeline_fast"),
  pipeline_deep: uniqueMap(readJsonl(join(results, "pipeline_deep.jsonl")), "prediction", "pipeline_deep"),
  lexicon: uniqueMap(readJsonl(join(results, "lexicon.jsonl")), "prediction", "lexicon"),
  player_A: uniqueMap(readJsonl(join(annotations, "annotator_A.jsonl")), "label", "annotator_A"),
  player_B: uniqueMap(readJsonl(join(annotations, "annotator_B.jsonl")), "label", "annotator_B"),
};

const scored = {};
for (const [name, predictions] of Object.entries(systems)) {
  scored[name] = {
    fullSeed: score(predictions, seed, [...seed.keys()]),
    coveredSeed: score(predictions, seed, agreed),
    coveredReferee: score(predictions, checkedGold, agreed),
  };
}

const judgeRows = readJsonl(join(results, "judge.jsonl"));
const judgedBy = {};
for (const row of judgeRows) {
  const who = row.judgedBy ?? "missing";
  judgedBy[who] = (judgedBy[who] ?? 0) + 1;
}

const audit = {
  generated: new Date().toISOString(),
  invariant: "referee_gold equals the C/D agreement set",
  pool: { n: seed.size, seedDistribution: distribution(seed) },
  coverage: {
    C: c.size,
    D: d.size,
    common: common.length,
    agreed: agreed.length,
    commonSeedDistribution: distribution(seed, common),
    agreedSeedDistribution: distribution(seed, agreed),
    refereeDistribution: distribution(checkedGold),
  },
  interReferee: kappa(c, d, common),
  seedVsReferee: score(seed, checkedGold, agreed),
  systems: scored,
  judgeAttribution: judgedBy,
};

const judge = scored.judge;
const sameCohortDeltaPp = (judge.coveredReferee.binaryRecall - judge.coveredSeed.binaryRecall) * 100;
const crossCohortDeltaPp = (judge.coveredReferee.binaryRecall - judge.fullSeed.binaryRecall) * 100;
const rows = Object.entries(scored).map(([name, s]) =>
  `| ${name} | ${s.fullSeed.n} | ${pct(s.fullSeed.binaryRecall)} | ${pct(s.coveredSeed.binaryRecall)} | ${pct(s.coveredReferee.binaryRecall)} | ${pct(s.coveredReferee.binaryFpr)} | ${pct(s.coveredReferee.accuracy)} |`
);

const report = `# 独立双模型裁判金标审计（可复现版）

> 生成命令：\`npm run eval:referee-audit\`。C/D 是两个独立模型裁判，不是人类标注者；人类金标完成前，本文结论只适用于裁判共同覆盖且一致的子集。

## 覆盖与选择偏差

- 全池：${seed.size} 单元；C 覆盖 ${c.size}，D 覆盖 ${d.size}，共同覆盖 ${common.length}。
- C/D 一致：${agreed.length}，Cohen's κ = ${audit.interReferee.kappa.toFixed(4)}（po=${audit.interReferee.po.toFixed(4)}）。
- referee gold 分布：${LABELS.map((label) => `${label} ${audit.coverage.refereeDistribution[label]}`).join(" / ")}。
- \`referee_gold.jsonl\` 已由脚本验证为 C/D 一致集的精确映射。
- crisis 仅 ${audit.coverage.refereeDistribution.crisis} 条；C 的端点审核又对 crisis 有选择性阻断，因此不得外推全池 crisis 表现。

## 同队列重评分

| 系统 | 全池 seed n | 全池 seed 二值召回 | 同一 ${agreed.length} 条 seed 二值召回 | 同一 ${agreed.length} 条 referee 二值召回 | referee FPR | referee 4类 acc |
|---|---:|---:|---:|---:|---:|---:|
${rows.join("\n")}

Judge 的可归因标签变化必须在同一队列比较：${pct(judge.coveredSeed.binaryRecall)} → ${pct(judge.coveredReferee.binaryRecall)}，变化 ${sameCohortDeltaPp.toFixed(1)}pp。把全池 ${pct(judge.fullSeed.binaryRecall)} 与覆盖子集 ${pct(judge.coveredReferee.binaryRecall)} 相减会得到 ${crossCohortDeltaPp.toFixed(1)}pp，但该值混入覆盖选择效应，**不得称为“裁判测得的偏差”**。

种子标签与 referee gold 的 4 类一致率为 ${audit.seedVsReferee.correct}/${audit.seedVsReferee.n} = ${pct(audit.seedVsReferee.accuracy)}。

## 判官归属证据边界

当前 \`judge.jsonl\` 的逐行 \`judgedBy\` 统计：${Object.entries(judgedBy).map(([key, n]) => `${key}=${n}`).join("，")}。因此 10 条归属探针只能证明探针当时的 fallback 状态，不能反推全部历史行的供应商归属；论文中应把该臂写作“历史结果，逐行归属缺失”，除非重新运行并落盘 \`judgedBy\`。

## 可发表边界

1. 可以报告共同覆盖子集的 κ、同队列指标和覆盖分布。
2. 不可以报告“总体恰好虚高 3pp”。本版本同队列变化为 ${sameCohortDeltaPp.toFixed(1)}pp。
3. 不可以把双模型裁判称为人工金标，也不可以对被审核阻断的 crisis 样本作总体结论。
`;

writeFileSync(join(EVAL, "reports", "referee_gold_v1.audit.json"), JSON.stringify(audit, null, 2) + "\n");
writeFileSync(join(EVAL, "reports", "referee_gold_v1.md"), report);
console.log(`referee audit OK: common=${common.length}, agreed=${agreed.length}, kappa=${audit.interReferee.kappa.toFixed(4)}, same-cohort delta=${sameCohortDeltaPp.toFixed(1)}pp`);
