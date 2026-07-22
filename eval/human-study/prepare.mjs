#!/usr/bin/env node
/** Build a deterministic, blinded human-annotation packet from eval datasets. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVAL = join(HERE, "..");
const OUT = join(HERE, "sheets");
const LABELS = ["none", "passive_ideation", "active_ideation", "crisis"];
const VERSION = "human-study-v0.2-seed-20260721";

function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(JSON.parse);
}

function loadUnits() {
  const units = [];
  for (const subdir of ["safety", "multiturn"]) {
    const dir = join(EVAL, "datasets", subdir);
    for (const filename of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
      for (const row of readJsonl(join(dir, filename))) {
        if (row._meta) continue;
        const turns = row.turns ?? [row.text];
        for (let turn = 0; turn < turns.length; turn++) {
          units.push({
            id: row.id,
            turn,
            key: `${row.id}#${turn}`,
            label: row.per_turn?.[turn]?.label ?? row.label,
            category: row.category,
            turns,
            history: turns.slice(0, turn + 1),
          });
        }
      }
    }
  }
  const keys = new Set();
  for (const unit of units) {
    if (keys.has(unit.key)) throw new Error(`duplicate dataset unit ${unit.key}`);
    keys.add(unit.key);
    if (!LABELS.includes(unit.label)) throw new Error(`invalid label ${unit.label} at ${unit.key}`);
  }
  return units;
}

function rank(items, salt) {
  return items.slice().sort((a, b) => {
    const ha = createHash("sha256").update(`${VERSION}:${salt}:${a.key}`).digest("hex");
    const hb = createHash("sha256").update(`${VERSION}:${salt}:${b.key}`).digest("hex");
    return ha.localeCompare(hb);
  });
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function renderHistory(unit) {
  return unit.history.map((text, index) => `第${index + 1}轮${index === unit.turn ? "（请标本轮）" : ""}: ${text}`).join("\n");
}

function count(rows, field, values) {
  return Object.fromEntries(values.map((value) => [value, rows.filter((row) => row[field] === value).length]));
}

const units = loadUnits();
const byKey = new Map(units.map((unit) => [unit.key, unit]));

// Calibration is exactly balanced: 3 per label. Exclude its whole conversation id from main.
const calibration = [];
const calibrationIds = new Set();
for (const label of LABELS) {
  const candidates = rank(units.filter((unit) => unit.label === label && !calibrationIds.has(unit.id)), `calibration:${label}`);
  for (const unit of candidates) {
    if (calibration.filter((x) => x.label === label).length === 3) break;
    if (calibrationIds.has(unit.id)) continue;
    calibration.push(unit);
    calibrationIds.add(unit.id);
  }
}
if (calibration.length !== 12) throw new Error(`expected 12 calibration units, got ${calibration.length}`);

// Primary analysis uses exactly 25 focal units per class. Full selected conversations are
// included as context rows, but those extras are not counted in the primary balanced estimate.
const focal = [];
for (const label of LABELS) {
  const candidates = rank(units.filter((unit) => unit.label === label && !calibrationIds.has(unit.id)), `main:${label}`);
  focal.push(...candidates.slice(0, 25));
}
const focalKeys = new Set(focal.map((unit) => unit.key));
if (focalKeys.size !== 100) throw new Error(`expected 100 unique focal units, got ${focalKeys.size}`);
const mainIds = new Set(focal.map((unit) => unit.id));
const main = units.filter((unit) => mainIds.has(unit.id)).map((unit) => ({
  ...unit,
  analysis_role: focalKeys.has(unit.key) ? "focal" : "context",
}));
if ([...mainIds].some((id) => calibrationIds.has(id))) throw new Error("calibration/main conversation overlap");

const orderedCalibration = rank(calibration, "calibration-order").map((unit) => ({ ...unit, set: "calibration", analysis_role: "calibration" }));
const orderedMain = rank(main, "main-order").map((unit) => ({ ...unit, set: "main" }));
const packet = [...orderedCalibration, ...orderedMain].map((unit, index) => ({ ...unit, sequence: index + 1 }));

mkdirSync(OUT, { recursive: true });
const keyRows = packet.map((unit) => ({
  sequence: unit.sequence,
  id: unit.id,
  turn: unit.turn,
  seed_gold: unit.label,
  set: unit.set,
  analysis_role: unit.analysis_role,
  category: unit.category,
}));
const keyText = keyRows.map((row) => JSON.stringify(row)).join("\n") + "\n";
const header = ["序号", "样本编号", "待标轮次", "对话内容（截至待标轮次）", "风险级别(none/passive_ideation/active_ideation/crisis)", "文本不自然或无法标注(是/留空)", "备注"];
const csvRows = packet.map((unit) => [unit.sequence, `H${String(unit.sequence).padStart(3, "0")}`, unit.turn + 1, renderHistory(unit), "", "", ""]);
const csvText = "\uFEFF" + [header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

const keyPath = join(OUT, "KEY_mapping_勿发给标注者.jsonl");
const csvPath = join(OUT, "标注表_盲.csv");
writeFileSync(keyPath, keyText);
writeFileSync(csvPath, csvText);
const manifest = {
  version: VERSION,
  generated: new Date().toISOString(),
  datasetPool: units.length,
  calibration: { n: orderedCalibration.length, distribution: count(orderedCalibration, "label", LABELS) },
  main: {
    rows: orderedMain.length,
    focal: focalKeys.size,
    context: orderedMain.length - focalKeys.size,
    focalDistribution: count(focal, "label", LABELS),
  },
  totalRows: packet.length,
  noConversationOverlapBetweenCalibrationAndMain: true,
  sha256: {
    key: createHash("sha256").update(keyText).digest("hex"),
    blindCsv: createHash("sha256").update(csvText).digest("hex"),
  },
};
writeFileSync(join(OUT, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`human-study packet OK: calibration=${manifest.calibration.n} (${LABELS.map((l) => `${l}=${manifest.calibration.distribution[l]}`).join(", ")}), main focal=${manifest.main.focal}, context=${manifest.main.context}, total=${manifest.totalRows}`);
