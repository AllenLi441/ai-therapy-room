#!/usr/bin/env node
/** Apply completed human gold to dataset review fields. Defaults to dry-run. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVAL = join(HERE, "..");
const GOLD = join(HERE, "human_gold.jsonl");
const apply = process.argv.includes("--apply");
if (!existsSync(GOLD)) throw new Error("human_gold.jsonl is absent; complete real annotation and adjudication first");
const rows = readFileSync(GOLD, "utf8").split("\n").filter(Boolean).map(JSON.parse);
const gold = new Map(rows.map((row) => [`${row.id}#${row.turn ?? 0}`, row]));
if (gold.size !== rows.length) throw new Error("human gold contains duplicate units");

let reviewed = 0, changed = 0, filesChanged = 0;
for (const subdir of ["safety", "multiturn"]) {
  const dir = join(EVAL, "datasets", subdir);
  for (const filename of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    const path = join(dir, filename);
    const source = readFileSync(path, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    let touched = false;
    for (const row of source) {
      if (row._meta) continue;
      const turns = row.turns ?? [row.text];
      const human = turns.map((_, turn) => gold.get(`${row.id}#${turn}`) ?? null);
      if (!human.some(Boolean)) continue;
      row.human_review = human.every(Boolean) ? "complete" : "partial";
      row.human_labels = human.map((entry) => entry?.label ?? null);
      row.human_label_provenance = "eval/human-study/human_gold.jsonl";
      reviewed += human.filter(Boolean).length;
      for (let turn = 0; turn < turns.length; turn++) {
        if (!human[turn]) continue;
        const seed = row.per_turn?.[turn]?.label ?? row.label;
        if (seed !== human[turn].label) changed += 1;
      }
      touched = true;
    }
    if (touched) {
      filesChanged += 1;
      if (apply) writeFileSync(path, source.map((row) => JSON.stringify(row)).join("\n") + "\n");
    }
  }
}
console.log(`${apply ? "applied" : "dry-run"}: reviewed units=${reviewed}, seed-label changes=${changed}, files=${filesChanged}`);
if (!apply) console.log("No files changed. Re-run with --apply only after HUMAN_GOLD_REPORT.md has been reviewed and archived.");
