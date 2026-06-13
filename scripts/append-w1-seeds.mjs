#!/usr/bin/env node
/**
 * scripts/append-w1-seeds.mjs
 *
 * Reads evals/w1-preannotated.jsonl and appends rows to
 * W1_种子样本集_v1.0.xlsx as a NEW sheet "Auto_FP_FN_待review".
 *
 * The schema mirrors the existing per-category sheets in the seed set,
 * but with extra columns capturing where the candidate came from (case_id,
 * verdict, preannotator) and leaves the two annotator columns
 * (标注员A_等级 / 标注员A_类别 / 标注员B_等级 / 标注员B_类别 / 仲裁结果)
 * blank for human review per the W1 manual's double-annotation requirement.
 *
 * Why a NEW sheet (instead of appending into A_告别式 / B_远行 / ...):
 *   - The auto-preannotations are not yet validated — they go through the
 *     same double-annotation + adjudication flow as any new seed before
 *     they are merged into the official per-category sheets.
 *   - Keeping them in a clearly-marked "待review" sheet means a human
 *     reviewing the seed set can immediately see what's machine-suggested
 *     vs what's been adjudicated.
 *
 * Usage:
 *   node scripts/append-w1-seeds.mjs
 */

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const inFile = fileURLToPath(new URL("../evals/w1-preannotated.jsonl", import.meta.url));
const xlsxFile = fileURLToPath(new URL("../W1_种子样本集_v1.0.xlsx", import.meta.url));

let raw;
try {
  raw = await readFile(inFile, "utf-8");
} catch {
  console.error(`No input at ${inFile.pathname}. Run scripts/preannotate-w1.mjs first.`);
  process.exit(2);
}

const rows = raw
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => JSON.parse(l));

if (rows.length === 0) {
  console.log("No preannotated rows to append.");
  process.exit(0);
}

const SHEET_NAME = "Auto_FP_FN_待review";

// Use Python (openpyxl) for the xlsx work — keeps Node side dependency-free.
const pyScript = `
import sys, json, os
from datetime import datetime
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

xlsx_path = sys.argv[1]
data_path = sys.argv[2]

with open(data_path, "r", encoding="utf-8") as f:
    rows = [json.loads(l) for l in f if l.strip()]

wb = load_workbook(xlsx_path)

# If sheet already exists, drop & recreate so each run is idempotent.
sheet_name = "Auto_FP_FN_待review"
if sheet_name in wb.sheetnames:
    del wb[sheet_name]
ws = wb.create_sheet(sheet_name)

# Title row
ws["B2"] = f"自动预标注（FP/FN 候选） — Auto preannotated for human review · 生成于 {datetime.utcnow().isoformat()}Z"
ws["B2"].font = Font(bold=True, size=13)

# Schema notes row
ws["B3"] = "操作: cssrs/category/cue/strategy 列已由 Kimi 预填; 请由两名标注员独立填写 标注员A_* 与 标注员B_*; 不一致项进入仲裁"
ws["B3"].font = Font(italic=True, color="555555")

# Headers (row 4) — mirror existing per-category sheets + extras
headers = [
    "ID",
    "verdict",
    "case_id",
    "单/多轮",
    "上下文(前文)",
    "用户消息",
    "C-SSRS等级(Kimi预)",
    "隐性类别(Kimi预)",
    "关键线索(Kimi预)",
    "推荐回复策略(Kimi预)",
    "pragmatic(Kimi预)",
    "is_implicit",
    "Kimi备注",
    "lexicon实际",
    "实际route",
    "标注员A_等级",
    "标注员A_类别",
    "标注员A_备注",
    "标注员B_等级",
    "标注员B_类别",
    "标注员B_备注",
    "仲裁结果",
    "仲裁人",
    "进入正式种子(是/否)"
]
for i, h in enumerate(headers, start=2):
    cell = ws.cell(row=4, column=i, value=h)
    cell.font = Font(bold=True)
    cell.fill = PatternFill("solid", fgColor="EEE7D5")
    cell.alignment = Alignment(wrap_text=True, vertical="center")

# Data rows starting at row 5
preannotator_fill = PatternFill("solid", fgColor="F5F1E8")
for idx, row in enumerate(rows, start=5):
    auto = (row.get("auto_annotation") or {})
    conversation = row.get("conversation")
    multi = "多轮" if conversation else "单轮"
    if conversation:
        context = "\\n".join(
            f"{m['role']}: {m['content'][:80]}"
            for m in conversation[:-1]
            if m.get("role")
        )
        user_msg = next((m["content"] for m in reversed(conversation) if m.get("role") == "user"), row.get("user_message", ""))
    else:
        context = ""
        user_msg = row.get("user_message") or ""

    key_cues = auto.get("key_cues") or []
    if isinstance(key_cues, list):
        key_cues_str = " / ".join(key_cues[:3])
    else:
        key_cues_str = str(key_cues)

    values = [
        f"AUTO-{idx-4:04d}",
        row.get("verdict") or "",
        row.get("case_id") or "",
        multi,
        context,
        user_msg,
        auto.get("cssrs_level") or "",
        auto.get("category") or "",
        key_cues_str,
        auto.get("response_strategy") or "",
        auto.get("pragmatic") or "",
        "是" if auto.get("is_implicit") else ("否" if auto.get("is_implicit") is False else ""),
        auto.get("notes") or "",
        (row.get("plan_risk") or {}).get("level", ""),
        row.get("actual_route") or "",
        "", "", "",  # 标注员 A
        "", "", "",  # 标注员 B
        "", "",      # 仲裁
        ""           # 进入正式种子
    ]
    for j, val in enumerate(values, start=2):
        cell = ws.cell(row=idx, column=j, value=val)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        # tint the kimi-prefilled columns
        if 7 <= j <= 13:
            cell.fill = preannotator_fill

# Column widths
widths = [10, 12, 26, 8, 28, 36, 13, 13, 22, 22, 12, 10, 26, 12, 18, 12, 12, 18, 12, 12, 18, 12, 12, 14]
for i, w in enumerate(widths, start=2):
    ws.column_dimensions[get_column_letter(i)].width = w

# Freeze header + first label column
ws.freeze_panes = "C5"

wb.save(xlsx_path)
print(f"Appended {len(rows)} rows to sheet '{sheet_name}' in {xlsx_path}")
`;

const result = spawnSync(
  "python3",
  ["-c", pyScript, xlsxFile, inFile],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error(`xlsx append failed with code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log("");
console.log(`Next steps (manual):`);
console.log(`  1. Open ${path.basename(xlsxFile)} → sheet "Auto_FP_FN_待review"`);
console.log(`  2. Two annotators independently fill 标注员A_* 与 标注员B_*`);
console.log(`  3. Disagreements → 仲裁人 finalizes 仲裁结果`);
console.log(`  4. Mark 进入正式种子=是 for adjudicated rows → move them to the matching A_/B_/.../G_ sheet`);
