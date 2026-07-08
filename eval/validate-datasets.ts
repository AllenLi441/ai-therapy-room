/**
 * 阶段 2 —— 安全测试集校验器。
 *
 * 独立脚本:不 import `src/` 与 `eval/adapters/`,零网络。
 * 用法: `npm run eval:validate`(assumes cwd = 仓库根,与 eval:smoke 一致)。
 *
 * 校验规则见 PHASE2_SPEC.md §4。任何违规 → exit(1)。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Label = "none" | "passive_ideation" | "active_ideation" | "crisis";
type Branch =
  | "normal"
  | "gentle_check"
  | "suspected"
  | "crisis"
  | "medication"
  | "diagnosis"
  | "medical_redflag";

const LABELS: Label[] = ["none", "passive_ideation", "active_ideation", "crisis"];
const BRANCHES: Branch[] = [
  "normal",
  "gentle_check",
  "suspected",
  "crisis",
  "medication",
  "diagnosis",
  "medical_redflag"
];
const HUMAN_REVIEWS = ["pending", "approved"];
const SOURCES = ["generated", "adapted"];

/** §2 标签↔分支一致性矩阵。acceptable_branches 不受此矩阵约束(见 §4.6 注)。 */
const LABEL_BRANCH_MATRIX: Record<Label, Branch[]> = {
  none: ["normal", "medication", "diagnosis", "medical_redflag"],
  passive_ideation: ["gentle_check", "suspected"],
  active_ideation: ["suspected"],
  crisis: ["crisis"]
};

/** §1 交付物清单:类别 → { 目录, id 数字区间 } */
const CATEGORY_RANGES: Record<string, { start: number; end: number; dir: string }> = {
  hard_negative_slang: { start: 1, end: 24, dir: "safety" },
  negation: { start: 101, end: 124, dir: "safety" },
  pinyin_evasion: { start: 201, end: 224, dir: "safety" },
  plain_sadness: { start: 301, end: 324, dir: "safety" },
  passive_wish: { start: 401, end: 424, dir: "safety" },
  explicit_ideation: { start: 501, end: 524, dir: "safety" },
  medication_boundary: { start: 601, end: 624, dir: "safety" },
  diagnosis_request: { start: 701, end: 724, dir: "safety" },
  somatic_redflag: { start: 801, end: 824, dir: "safety" },
  gradual_escalation: { start: 901, end: 920, dir: "multiturn" },
  recovery_statement: { start: 1001, end: 1020, dir: "multiturn" }
};

/** §0.1 禁用词(方法/手段/剂量细节)。 */
const FULL_BANNED = [
  "跳楼", "上吊", "烧炭", "煤气", "割腕", "割脉", "农药", "跳河", "跳桥",
  "投河", "卧轨", "刀片", "绳子", "楼顶", "天台", "桥上", "整瓶", "半瓶",
  "安眠药", "镇静药", "剂量", "毫克", "mg", "多少片", "多少粒"
];
/** 意念核心词:保持 medication_boundary/diagnosis_request/somatic_redflag 类别纯净。 */
const IDEATION_CORE = ["想死", "不想活", "自杀", "活不下去", "轻生", "结束生命"];
/** medication_boundary 专用:数字剂量一律禁止(药物类名允许)。 */
const DOSAGE_REGEX = /\d+\s*(mg|毫克|片|粒)/i;

/** §4.7:8 个意念相关类,扫全部禁用词。 */
const IDEATION_CATEGORIES = new Set([
  "hard_negative_slang",
  "negation",
  "pinyin_evasion",
  "plain_sadness",
  "passive_wish",
  "explicit_ideation",
  "gradual_escalation",
  "recovery_statement"
]);
/** 只扫意念核心词(保持类别纯净),不扫全部禁用词。 */
const IDEATION_CORE_ONLY_CATEGORIES = new Set(["diagnosis_request", "somatic_redflag"]);

type Row = Record<string, unknown>;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function oneOf<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function lintForbiddenWords(category: string, text: string): string[] {
  const hits: string[] = [];
  const lower = text.toLowerCase();
  if (IDEATION_CATEGORIES.has(category)) {
    for (const w of FULL_BANNED) {
      if (lower.includes(w.toLowerCase())) hits.push(w);
    }
  } else if (category === "medication_boundary") {
    if (DOSAGE_REGEX.test(text)) hits.push("<数字剂量>");
    for (const w of IDEATION_CORE) {
      if (text.includes(w)) hits.push(w);
    }
  } else if (IDEATION_CORE_ONLY_CATEGORIES.has(category)) {
    for (const w of IDEATION_CORE) {
      if (text.includes(w)) hits.push(w);
    }
  }
  return hits;
}

function validatePerTurnEntry(
  entry: unknown,
  file: string,
  lineNo: number,
  turnIdx: number,
  errors: string[]
): void {
  if (typeof entry !== "object" || entry === null) {
    errors.push(`${file}:${lineNo}: per_turn[${turnIdx}] 不是对象`);
    return;
  }
  const e = entry as Row;
  if (!oneOf(e.label, LABELS)) {
    errors.push(`${file}:${lineNo}: per_turn[${turnIdx}].label 非法: ${JSON.stringify(e.label)}`);
    return;
  }
  if (!oneOf(e.expected_branch, BRANCHES)) {
    errors.push(`${file}:${lineNo}: per_turn[${turnIdx}].expected_branch 非法: ${JSON.stringify(e.expected_branch)}`);
    return;
  }
  const allowed = LABEL_BRANCH_MATRIX[e.label as Label];
  if (!allowed.includes(e.expected_branch as Branch)) {
    errors.push(
      `${file}:${lineNo}: per_turn[${turnIdx}] 标签↔分支不一致: label=${e.label} expected_branch=${e.expected_branch}`
    );
  }
  if (e.expect_crisis_banner !== undefined && typeof e.expect_crisis_banner !== "boolean") {
    errors.push(`${file}:${lineNo}: per_turn[${turnIdx}].expect_crisis_banner 必须是布尔值`);
  }
}

function validateRow(
  row: Row,
  category: string,
  file: string,
  lineNo: number,
  seenIds: Map<string, string>,
  errors: string[]
): void {
  // 字段齐全
  const requiredFields = ["id", "turns", "label", "expected_branch", "category", "rationale", "human_review", "source"];
  for (const f of requiredFields) {
    if (row[f] === undefined) {
      errors.push(`${file}:${lineNo}: 缺少字段 ${f}`);
      return;
    }
  }

  // id 格式 + 全局唯一 + 区间
  const id = row.id;
  if (typeof id !== "string" || !/^sft-\d{4}$/.test(id)) {
    errors.push(`${file}:${lineNo}: id 格式非法: ${JSON.stringify(id)}`);
  } else {
    const prior = seenIds.get(id);
    if (prior) {
      errors.push(`${file}:${lineNo}: id 重复 ${id}(首次出现于 ${prior})`);
    } else {
      seenIds.set(id, `${file}:${lineNo}`);
    }
    const range = CATEGORY_RANGES[category];
    const num = Number(id.slice(4));
    if (num < range.start || num > range.end) {
      errors.push(`${file}:${lineNo}: id ${id} 超出 ${category} 的区间 sft-${String(range.start).padStart(4, "0")}~sft-${String(range.end).padStart(4, "0")}`);
    }
  }

  // category 字段与文件一致
  if (row.category !== category) {
    errors.push(`${file}:${lineNo}: category 字段(${JSON.stringify(row.category)})与文件类别(${category})不一致`);
  }

  // turns
  const turns = row.turns;
  if (!Array.isArray(turns) || turns.length === 0 || !turns.every((t) => isNonEmptyString(t))) {
    errors.push(`${file}:${lineNo}: turns 必须是非空字符串数组`);
    return;
  }

  // label / expected_branch / acceptable_branches
  if (!oneOf(row.label, LABELS)) {
    errors.push(`${file}:${lineNo}: label 非法: ${JSON.stringify(row.label)}`);
  }
  if (!oneOf(row.expected_branch, BRANCHES)) {
    errors.push(`${file}:${lineNo}: expected_branch 非法: ${JSON.stringify(row.expected_branch)}`);
  }
  if (oneOf(row.label, LABELS) && oneOf(row.expected_branch, BRANCHES)) {
    const allowed = LABEL_BRANCH_MATRIX[row.label as Label];
    if (!allowed.includes(row.expected_branch as Branch)) {
      errors.push(`${file}:${lineNo}: 标签↔分支不一致: label=${row.label} expected_branch=${row.expected_branch}`);
    }
  }
  if (row.acceptable_branches !== undefined) {
    if (!Array.isArray(row.acceptable_branches) || !row.acceptable_branches.every((b) => oneOf(b, BRANCHES))) {
      errors.push(`${file}:${lineNo}: acceptable_branches 含非法分支值`);
    }
  }

  // human_review / source
  if (!oneOf(row.human_review, HUMAN_REVIEWS)) {
    errors.push(`${file}:${lineNo}: human_review 非法: ${JSON.stringify(row.human_review)}`);
  }
  if (!oneOf(row.source, SOURCES)) {
    errors.push(`${file}:${lineNo}: source 非法: ${JSON.stringify(row.source)}`);
  }

  // rationale
  if (typeof row.rationale !== "string" || row.rationale.length === 0) {
    errors.push(`${file}:${lineNo}: rationale 缺失或非字符串`);
  } else if (row.rationale.length > 80) {
    errors.push(`${file}:${lineNo}: rationale 超过 80 字(实际 ${row.rationale.length})`);
  }

  // turns.length>1 ⟺ per_turn 必填且等长;单轮禁止 per_turn
  const perTurn = row.per_turn;
  if (turns.length > 1) {
    if (!Array.isArray(perTurn) || perTurn.length !== turns.length) {
      errors.push(`${file}:${lineNo}: 多轮样例(${turns.length} 轮)必须有等长的 per_turn`);
    } else {
      perTurn.forEach((entry, idx) => validatePerTurnEntry(entry, file, lineNo, idx, errors));
    }
  } else if (perTurn !== undefined) {
    errors.push(`${file}:${lineNo}: 单轮样例禁止出现 per_turn`);
  }

  // 禁用词 lint(扫 turns 原文)
  const hits = lintForbiddenWords(category, turns.join(" "));
  if (hits.length > 0) {
    errors.push(`${file}:${lineNo}: 命中禁用词/核心词 [${hits.join(", ")}]`);
  }
}

function validateFile(dir: string, filename: string, errors: string[], seenIds: Map<string, string>): number {
  const category = filename.replace(/\.jsonl$/, "");
  const file = `eval/datasets/${dir}/${filename}`;
  const range = CATEGORY_RANGES[category];
  if (!range) {
    errors.push(`${file}: 未知类别(不在 §1 交付物清单中)`);
    return 0;
  }
  if (range.dir !== dir) {
    errors.push(`${file}: 应位于 eval/datasets/${range.dir}/,而不是 ${dir}/`);
  }

  const raw = readFileSync(join(process.cwd(), file), "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    errors.push(`${file}: 空文件`);
    return 0;
  }

  // 首行 _meta
  let meta: Row;
  try {
    meta = JSON.parse(lines[0]);
  } catch {
    errors.push(`${file}:1: 首行不是合法 JSON(应为 _meta)`);
    return 0;
  }
  if (typeof meta._meta !== "object" || meta._meta === null) {
    errors.push(`${file}:1: 首行缺少 _meta`);
    return 0;
  }
  const metaObj = meta._meta as Row;
  if (metaObj.category !== category) {
    errors.push(`${file}:1: _meta.category(${JSON.stringify(metaObj.category)})与文件类别(${category})不一致`);
  }

  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    let row: Row;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      errors.push(`${file}:${lineNo}: 非法 JSON`);
      continue;
    }
    validateRow(row, category, file, lineNo, seenIds, errors);
    count += 1;
  }
  return count;
}

function main(): void {
  const errors: string[] = [];
  const seenIds = new Map<string, string>();
  const counts: Record<string, number> = {};

  for (const dir of ["safety", "multiturn"]) {
    const dirPath = join(process.cwd(), "eval/datasets", dir);
    let files: string[];
    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl")).sort();
    } catch {
      errors.push(`eval/datasets/${dir}/: 目录不存在或不可读`);
      continue;
    }
    for (const filename of files) {
      const category = filename.replace(/\.jsonl$/, "");
      counts[category] = validateFile(dir, filename, errors, seenIds);
    }
  }

  console.log("=== 阶段 2 安全测试集校验 ===\n");
  console.log("类别计数:");
  let total = 0;
  for (const category of Object.keys(CATEGORY_RANGES)) {
    const range = CATEGORY_RANGES[category];
    const expected = range.end - range.start + 1;
    const actual = counts[category] ?? 0;
    total += actual;
    const status = actual === expected ? "OK" : "MISMATCH";
    console.log(`  ${category.padEnd(22)} ${String(actual).padStart(3)} / ${expected}  [${status}]`);
    if (actual !== expected) {
      errors.push(`${category}: 期望 ${expected} 条,实际 ${actual} 条`);
    }
  }
  console.log(`\n共计 ${total} 条(期望 256 条)`);
  if (total !== 256) {
    errors.push(`总条数 ${total} != 256`);
  }

  if (errors.length > 0) {
    console.log(`\n发现 ${errors.length} 处违规:\n`);
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log("");
    process.exitCode = 1;
  } else {
    console.log("\n全部通过,零违规。");
    process.exitCode = 0;
  }
}

main();
