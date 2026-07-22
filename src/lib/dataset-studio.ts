export const RISK_LABELS = ["none", "passive_ideation", "active_ideation", "crisis"] as const;
export const PRODUCT_BRANCHES = [
  "normal",
  "gentle_check",
  "suspected",
  "crisis",
  "medication",
  "diagnosis",
  "medical_redflag",
] as const;

export const SELF_REVIEW_ITEMS = [
  { key: "contains_real_user_data", label: "不包含真实用户资料", expected: false },
  { key: "copied_from_external_dataset", label: "没有复制外部数据集原文", expected: false },
  { key: "context_sufficient", label: "上下文足以独立判断", expected: true },
  { key: "single_primary_construct", label: "只有一个主要评测构念", expected: true },
  { key: "non_graphic", label: "不含图示化或可操作的危险细节", expected: true },
  { key: "manually_edited", label: "已由作者逐字阅读并人工修改", expected: true },
] as const;

export type RiskLabel = (typeof RISK_LABELS)[number];
export type ProductBranch = (typeof PRODUCT_BRANCHES)[number];
export type SelfReviewKey = (typeof SELF_REVIEW_ITEMS)[number]["key"];
export type TriState = "" | "yes" | "no";

export type AuthorCandidate = {
  id: string;
  batch: string;
  scenario_cell: string;
  turns: string[];
  target_turn: number;
  intended_label: "" | RiskLabel;
  intended_branch: "" | ProductBranch;
  author_rationale: string;
  boundary_with: RiskLabel[];
  expected_difficulty: "" | "easy" | "medium" | "hard";
  provenance: {
    origin: "" | "human_only" | "llm_assisted_then_human_rewritten";
    provider: string;
    model: string;
    prompt_sha256: string;
    created_at: string;
    human_editor: true;
    author_id: string;
  };
  self_review: Record<SelfReviewKey, boolean>;
  self_review_confirmed: Record<SelfReviewKey, boolean>;
};

export type BlindItem = {
  sequence: number;
  blind_item_id: string;
  target_turn: number;
  conversation: string;
  set?: string;
  analysis_role?: string;
};

export type ReviewerRecord = BlindItem & {
  risk_label: "" | RiskLabel;
  confidence: "" | "1" | "2" | "3" | "4";
  naturalness: "" | "1" | "2" | "3" | "4" | "5";
  labelable: TriState;
  context_sufficient: TriState;
  disposition: "" | "keep" | "revise" | "drop";
  reason_code: string;
  unnatural: boolean;
  optional_comment: string;
};

export const REVIEW_CSV_COLUMNS = {
  sequence: "序号",
  blindId: "样本编号",
  targetTurn: "待标轮次",
  conversation: "对话内容（截至待标轮次）",
  riskLabel: "风险级别(none/passive_ideation/active_ideation/crisis)",
  confidence: "置信度(1-4)",
  naturalness: "自然度(1-5)",
  labelable: "可标注(是/否)",
  contextSufficient: "上下文充分(是/否)",
  disposition: "处理建议(保留/修改/删除)",
  reasonCode: "原因代码",
  unnatural: "文本不自然或无法标注(是/留空)",
  comment: "备注",
} as const;

const validRiskLabel = (value: unknown): value is RiskLabel =>
  typeof value === "string" && (RISK_LABELS as readonly string[]).includes(value);

const validProductBranch = (value: unknown): value is ProductBranch =>
  typeof value === "string" && (PRODUCT_BRANCHES as readonly string[]).includes(value);

function blankSelfReview(): Record<SelfReviewKey, boolean> {
  return Object.fromEntries(SELF_REVIEW_ITEMS.map(({ key, expected }) => [key, expected])) as Record<SelfReviewKey, boolean>;
}

function blankSelfReviewConfirmation(): Record<SelfReviewKey, boolean> {
  return Object.fromEntries(SELF_REVIEW_ITEMS.map(({ key }) => [key, false])) as Record<SelfReviewKey, boolean>;
}

export function createBlankAuthorCandidate(index: number, batch = "", authorId = ""): AuthorCandidate {
  return {
    id: `exp-${String(index).padStart(4, "0")}`,
    batch,
    scenario_cell: "",
    turns: [""],
    target_turn: 0,
    intended_label: "",
    intended_branch: "",
    author_rationale: "",
    boundary_with: [],
    expected_difficulty: "",
    provenance: {
      origin: "",
      provider: "",
      model: "",
      prompt_sha256: "",
      created_at: new Date().toISOString(),
      human_editor: true,
      author_id: authorId,
    },
    self_review: blankSelfReview(),
    self_review_confirmed: blankSelfReviewConfirmation(),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeTurns(raw: Record<string, unknown>): string[] {
  for (const value of [raw.turns, raw.history]) {
    if (Array.isArray(value)) {
      const turns = value.filter((item): item is string => typeof item === "string");
      if (turns.length) return turns;
    }
  }
  const text = stringValue(raw.text) || stringValue(raw.conversation);
  return [text];
}

export function normalizeAuthorCandidate(
  value: unknown,
  index: number,
  defaults: { batch?: string; authorId?: string } = {},
): AuthorCandidate {
  const raw = asObject(value);
  const provenance = asObject(raw.provenance);
  const selfReview = asObject(raw.self_review);
  const selfReviewConfirmed = asObject(raw.self_review_confirmed);
  const turns = normalizeTurns(raw);
  const rawTarget = Number(raw.target_turn);
  const targetTurn = Number.isInteger(rawTarget) ? Math.min(Math.max(rawTarget, 0), turns.length - 1) : turns.length - 1;
  const boundary = Array.isArray(raw.boundary_with) ? raw.boundary_with.filter(validRiskLabel) : [];
  const difficulty = raw.expected_difficulty;
  const origin = provenance.origin;

  return {
    id: stringValue(raw.id) || `exp-${String(index).padStart(4, "0")}`,
    batch: stringValue(raw.batch) || defaults.batch || "",
    scenario_cell: stringValue(raw.scenario_cell),
    turns,
    target_turn: targetTurn,
    // Deliberately do not map raw.label, seed labels, gold labels, or model predictions.
    intended_label: validRiskLabel(raw.intended_label) ? raw.intended_label : "",
    intended_branch: validProductBranch(raw.intended_branch) ? raw.intended_branch : "",
    author_rationale: stringValue(raw.author_rationale),
    boundary_with: boundary,
    expected_difficulty: difficulty === "easy" || difficulty === "medium" || difficulty === "hard" ? difficulty : "",
    provenance: {
      origin: origin === "human_only" || origin === "llm_assisted_then_human_rewritten" ? origin : "",
      provider: stringValue(provenance.provider),
      model: stringValue(provenance.model),
      prompt_sha256: stringValue(provenance.prompt_sha256),
      created_at: stringValue(provenance.created_at) || new Date().toISOString(),
      human_editor: true,
      author_id: stringValue(provenance.author_id) || defaults.authorId || "",
    },
    self_review: Object.fromEntries(
      SELF_REVIEW_ITEMS.map(({ key, expected }) => [key, typeof selfReview[key] === "boolean" ? selfReview[key] : expected]),
    ) as Record<SelfReviewKey, boolean>,
    self_review_confirmed: Object.fromEntries(
      SELF_REVIEW_ITEMS.map(({ key }) => [key, selfReviewConfirmed[key] === true]),
    ) as Record<SelfReviewKey, boolean>,
  };
}

export function parseAuthorFile(text: string, defaults: { batch?: string; authorId?: string } = {}): AuthorCandidate[] {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  let rows: unknown[];
  if (clean.startsWith("[")) {
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) throw new Error("JSON 顶层必须是数组");
    rows = parsed;
  } else {
    rows = clean.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`JSONL 第 ${index + 1} 行不是有效 JSON`);
      }
    });
  }
  return rows
    .filter((row) => !asObject(row)._meta)
    .map((row, index) => normalizeAuthorCandidate(row, index + 1, defaults));
}

export function authorCandidateIssues(candidate: AuthorCandidate): string[] {
  const issues: string[] = [];
  if (!candidate.id.trim()) issues.push("缺少样本 ID");
  if (!candidate.batch.trim()) issues.push("缺少批次");
  if (!candidate.scenario_cell.trim()) issues.push("缺少场景格子");
  if (!candidate.turns.length || candidate.turns.some((turn) => !turn.trim())) issues.push("存在空白对话轮次");
  if (!candidate.intended_label) issues.push("未填写作者预期风险标签");
  if (!candidate.intended_branch) issues.push("未填写作者预期产品路线");
  if (!candidate.author_rationale.trim()) issues.push("未填写作者理由");
  if (!candidate.expected_difficulty) issues.push("未填写预期难度");
  if (!candidate.provenance.origin) issues.push("未填写创建方式");
  if (!candidate.provenance.author_id.trim()) issues.push("未填写作者 ID");
  if (!candidate.provenance.created_at.trim()) issues.push("未填写创建时间");
  if (candidate.provenance.origin === "llm_assisted_then_human_rewritten") {
    if (!candidate.provenance.provider.trim()) issues.push("缺少 LLM 供应商");
    if (!candidate.provenance.model.trim()) issues.push("缺少 LLM 模型");
    if (!/^[a-f0-9]{64}$/i.test(candidate.provenance.prompt_sha256)) issues.push("prompt SHA-256 应为64位十六进制");
  }
  if (SELF_REVIEW_ITEMS.some(({ key, expected }) => candidate.self_review[key] !== expected)) issues.push("自审事实值不符合安全要求");
  if (SELF_REVIEW_ITEMS.some(({ key }) => !candidate.self_review_confirmed[key])) issues.push("自审清单尚未全部确认");
  return issues;
}

export const authorCandidateComplete = (candidate: AuthorCandidate) => authorCandidateIssues(candidate).length === 0;

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function parseCsv(text: string): Record<string, string>[] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function yesNo(value: string): TriState {
  if (/^(是|yes|y|1)$/i.test(value.trim())) return "yes";
  if (/^(否|no|n|0)$/i.test(value.trim())) return "no";
  return "";
}

function dispositionValue(value: string): ReviewerRecord["disposition"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "保留" || normalized === "keep") return "keep";
  if (normalized === "修改" || normalized === "revise") return "revise";
  if (normalized === "删除" || normalized === "drop") return "drop";
  return "";
}

export function parseBlindCsv(text: string): ReviewerRecord[] {
  return parseCsv(text).map((row, index) => {
    const label = row[REVIEW_CSV_COLUMNS.riskLabel]?.trim();
    const confidence = row[REVIEW_CSV_COLUMNS.confidence]?.trim();
    const naturalness = row[REVIEW_CSV_COLUMNS.naturalness]?.trim();
    return {
      sequence: Number(row[REVIEW_CSV_COLUMNS.sequence]) || index + 1,
      blind_item_id: row[REVIEW_CSV_COLUMNS.blindId]?.trim() || `H${String(index + 1).padStart(3, "0")}`,
      target_turn: Number(row[REVIEW_CSV_COLUMNS.targetTurn]) || 1,
      conversation: row[REVIEW_CSV_COLUMNS.conversation] ?? "",
      risk_label: validRiskLabel(label) ? label : "",
      confidence: confidence === "1" || confidence === "2" || confidence === "3" || confidence === "4" ? confidence : "",
      naturalness: naturalness === "1" || naturalness === "2" || naturalness === "3" || naturalness === "4" || naturalness === "5" ? naturalness : "",
      labelable: yesNo(row[REVIEW_CSV_COLUMNS.labelable] ?? ""),
      context_sufficient: yesNo(row[REVIEW_CSV_COLUMNS.contextSufficient] ?? ""),
      disposition: dispositionValue(row[REVIEW_CSV_COLUMNS.disposition] ?? ""),
      reason_code: row[REVIEW_CSV_COLUMNS.reasonCode] ?? "",
      unnatural: /^(是|yes|y|1)$/i.test(row[REVIEW_CSV_COLUMNS.unnatural]?.trim() ?? ""),
      optional_comment: row[REVIEW_CSV_COLUMNS.comment] ?? "",
    };
  });
}

export function parseBlindJsonl(text: string): ReviewerRecord[] {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return asObject(JSON.parse(line));
    } catch {
      throw new Error(`JSONL 第 ${index + 1} 行不是有效 JSON`);
    }
  });
  return rows.filter((row) => !row._meta).map((row, index) => {
    const history = Array.isArray(row.history) ? row.history.filter((item): item is string => typeof item === "string") : [];
    const conversation = stringValue(row.conversation) || history.join("\n") || stringValue(row.text);
    return {
      sequence: Number(row.sequence) || index + 1,
      blind_item_id: stringValue(row.blind_item_id) || stringValue(row.sample_id) || `H${String(index + 1).padStart(3, "0")}`,
      target_turn: Number(row.target_turn) || history.length || 1,
      conversation,
      set: stringValue(row.set) || undefined,
      analysis_role: stringValue(row.analysis_role) || undefined,
      // Ignore seed/gold/intended/model fields even if a malformed blind file contains them.
      risk_label: validRiskLabel(row.risk_label) ? row.risk_label : "",
      confidence: row.confidence === "1" || row.confidence === "2" || row.confidence === "3" || row.confidence === "4" ? row.confidence : "",
      naturalness: row.naturalness === "1" || row.naturalness === "2" || row.naturalness === "3" || row.naturalness === "4" || row.naturalness === "5" ? row.naturalness : "",
      labelable: row.labelable === "yes" || row.labelable === "no" ? row.labelable : "",
      context_sufficient: row.context_sufficient === "yes" || row.context_sufficient === "no" ? row.context_sufficient : "",
      disposition: row.disposition === "keep" || row.disposition === "revise" || row.disposition === "drop" ? row.disposition : "",
      reason_code: stringValue(row.reason_code),
      unnatural: row.unnatural === true,
      optional_comment: stringValue(row.optional_comment),
    };
  });
}

export function parseReviewerFile(text: string, filename: string): ReviewerRecord[] {
  return filename.toLowerCase().endsWith(".csv") ? parseBlindCsv(text) : parseBlindJsonl(text);
}

export function reviewerRecordComplete(record: ReviewerRecord): boolean {
  return Boolean(
    record.risk_label &&
      record.confidence &&
      record.naturalness &&
      record.labelable &&
      record.context_sufficient &&
      record.disposition,
  );
}

function renderAuthorConversation(candidate: AuthorCandidate): string {
  return candidate.turns
    .slice(0, candidate.target_turn + 1)
    .map((turn, index) => `第${index + 1}轮${index === candidate.target_turn ? "（请标本轮）" : ""}: ${turn}`)
    .join("\n");
}

function stableBlindRank(candidate: AuthorCandidate): number {
  const value = `dataset-studio-v1:${candidate.batch}:${candidate.id}:${candidate.target_turn}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function orderCandidatesForBlind(candidates: AuthorCandidate[]): AuthorCandidate[] {
  return [...candidates].sort((left, right) => {
    const rankDifference = stableBlindRank(left) - stableBlindRank(right);
    return rankDifference || left.id.localeCompare(right.id);
  });
}

export function buildBlindItems(candidates: AuthorCandidate[]): BlindItem[] {
  return orderCandidatesForBlind(candidates).map((candidate, index) => ({
    sequence: index + 1,
    blind_item_id: `B${String(index + 1).padStart(3, "0")}`,
    target_turn: candidate.target_turn + 1,
    conversation: renderAuthorConversation(candidate),
  }));
}

export function serializeAuthorJsonl(candidates: AuthorCandidate[]): string {
  return candidates.map((candidate) => JSON.stringify(candidate)).join("\n") + (candidates.length ? "\n" : "");
}

export function serializePrivateMappingJsonl(candidates: AuthorCandidate[]): string {
  return orderCandidatesForBlind(candidates)
    .map((candidate, index) => JSON.stringify({
      sequence: index + 1,
      blind_item_id: `B${String(index + 1).padStart(3, "0")}`,
      source_id: candidate.id,
      target_turn: candidate.target_turn,
      intended_label: candidate.intended_label,
      intended_branch: candidate.intended_branch,
      author_rationale: candidate.author_rationale,
    }))
    .join("\n") + (candidates.length ? "\n" : "");
}

export function blankReviewerRecord(item: BlindItem): ReviewerRecord {
  return {
    ...item,
    risk_label: "",
    confidence: "",
    naturalness: "",
    labelable: "",
    context_sufficient: "",
    disposition: "",
    reason_code: "",
    unnatural: false,
    optional_comment: "",
  };
}

export function serializeReviewerCsv(records: ReviewerRecord[]): string {
  const header = Object.values(REVIEW_CSV_COLUMNS);
  const disposition = { keep: "保留", revise: "修改", drop: "删除", "": "" } as const;
  const rows = records.map((record) => [
    record.sequence,
    record.blind_item_id,
    record.target_turn,
    record.conversation,
    record.risk_label,
    record.confidence,
    record.naturalness,
    record.labelable === "yes" ? "是" : record.labelable === "no" ? "否" : "",
    record.context_sufficient === "yes" ? "是" : record.context_sufficient === "no" ? "否" : "",
    disposition[record.disposition],
    record.reason_code,
    record.unnatural ? "是" : "",
    record.optional_comment,
  ]);
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
