import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assessConversationRisk, getDangerLevel } from "./safety";
import type { ChatMessage } from "./types";

/**
 * P0 baseline harness. Runs the labeled seed corpus through the DETERMINISTIC
 * layer only (lexicon + accumulator via assessConversationRisk). The Kimi
 * semantic layer is NOT exercised here (that needs a live model — a separate
 * full-stack eval). Purpose: quantify (a) how little the deterministic layer
 * catches of the implicit corpus → how much rides on the LLM, and (b) the
 * deterministic FALSE-POSITIVE rate on the benign negatives (the precision
 * baseline we must not regress). This is a REPORT today; it becomes a frozen
 * gate once labels are clinician-reviewed.
 */

type SeedCase = {
  id: string;
  lang: string;
  kind: "positive" | "negative";
  category: string;
  expectedSeverity: string;
  expectedRouting: string;
  pragmatic: string;
  text: string;
  rationale: string;
};

const corpus: SeedCase[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "evals/detection-seed-corpus.json"), "utf-8")
);

const redteam: SeedCase[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "evals/detection-redteam-corpus.json"), "utf-8")
);

// Regression bound for adversarial benign-look-alike false positives in the
// DETERMINISTIC layer. Set from the observed baseline (see evals/redteam-report.txt);
// this is a ratchet — it may be lowered as precision improves, never silently raised.
// Observed deterministic baseline = 6/12 (third-party concern + gaming/科普/hyperbole/
// quote look-alikes the lexicon trips on but the Kimi `pragmatic` field releases at
// runtime). Reducing this is deterministic-precision work (benign guards in safety.ts)
// gated by human review — tracked separately.
const REDTEAM_FP_BOUND = 6;

function toMessages(text: string): ChatMessage[] {
  return text.split(" || ").map((t) => ({ role: "user", content: t.trim() }));
}

// "detected" by the deterministic layer = danger level >= 2 (flagged beyond normal).
function lexiconDetected(text: string): boolean {
  return getDangerLevel(assessConversationRisk(toMessages(text))) >= 2;
}

function fam(c: SeedCase): string {
  return (c.category || "?").split(":")[0];
}

describe("detection seed corpus — DETERMINISTIC (lexicon+accumulator) baseline", () => {
  it("reports per-category lexicon recall (positives) and false-positives (negatives)", () => {
    const pos = corpus.filter((c) => c.kind === "positive");
    const neg = corpus.filter((c) => c.kind === "negative");
    const posHit = pos.filter((c) => lexiconDetected(c.text));
    const negHit = neg.filter((c) => lexiconDetected(c.text)); // false positives

    const byFam: Record<string, { p: number; pHit: number; n: number; nHit: number }> = {};
    for (const c of corpus) {
      const f = fam(c);
      byFam[f] = byFam[f] || { p: 0, pHit: 0, n: 0, nHit: 0 };
      const hit = lexiconDetected(c.text);
      if (c.kind === "positive") {
        byFam[f].p++;
        if (hit) byFam[f].pHit++;
      } else {
        byFam[f].n++;
        if (hit) byFam[f].nHit++;
      }
    }

    const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "—");
    const out: string[] = [];
    out.push("=== DETERMINISTIC (lexicon-only) baseline — Kimi semantic layer NOT exercised ===");
    out.push(
      `positives: lexicon recall = ${posHit.length}/${pos.length} (${pct(posHit.length, pos.length)}) → the remainder rides entirely on the Kimi layer (which fast-mode skipped pre-P1)`
    );
    out.push(
      `negatives: lexicon FALSE-POSITIVE = ${negHit.length}/${neg.length} (${pct(negHit.length, neg.length)}) → precision baseline (lower is better)`
    );
    out.push("--- per category-family : recall(pos) | FP(neg) ---");
    for (const [f, s] of Object.entries(byFam).sort()) {
      out.push(`  ${f.padEnd(12)} recall ${s.pHit}/${s.p} (${pct(s.pHit, s.p)})   FP ${s.nHit}/${s.n} (${pct(s.nHit, s.n)})`);
    }
    if (negHit.length) {
      out.push("--- lexicon FALSE POSITIVES (benign wrongly flagged → precision leaks) ---");
      negHit.forEach((c) => out.push(`  [${c.category}] ${c.text.slice(0, 56)}`));
    }
    writeFileSync(path.join(process.cwd(), "evals/baseline-report.txt"), out.join("\n"));

    expect(corpus.length).toBeGreaterThan(100);
  });
});

describe("detection RED-TEAM corpus — DETERMINISTIC (lexicon+accumulator) adversarial pass", () => {
  /**
   * P6 adversarial corpus. Positives are engineered to DEFEAT the deterministic
   * lexicon (pinyin/abbrev substitution, coded euphemism, gradient build-up),
   * so low deterministic recall here is EXPECTED and documents how much rides on
   * the Kimi semantic layer. The negatives are adversarial benign look-alikes
   * (gaming/lyrics/news/medical) — deterministic FALSE-POSITIVES on these are the
   * real precision gate: this set must never start over-firing.
   */
  it("reports adversarial deterministic recall + guards the benign-look-alike FP rate", () => {
    const pos = redteam.filter((c) => c.kind === "positive");
    const neg = redteam.filter((c) => c.kind === "negative");
    const posHit = pos.filter((c) => lexiconDetected(c.text));
    const negHit = neg.filter((c) => lexiconDetected(c.text)); // false positives

    const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "—");
    const out: string[] = [];
    out.push("=== RED-TEAM (adversarial) DETERMINISTIC pass — Kimi semantic layer NOT exercised ===");
    out.push(
      `positives: deterministic recall = ${posHit.length}/${pos.length} (${pct(posHit.length, pos.length)}) → LOW is EXPECTED (these are built to bypass the lexicon; they must be caught by the Kimi layer at runtime)`
    );
    out.push(
      `negatives: deterministic FALSE-POSITIVE = ${negHit.length}/${neg.length} (${pct(negHit.length, neg.length)}) → adversarial precision gate (must not regress)`
    );
    if (negHit.length) {
      out.push("--- adversarial FALSE POSITIVES (benign look-alikes wrongly flagged) ---");
      negHit.forEach((c) => out.push(`  [${c.category}] ${c.text.slice(0, 60)}`));
    }
    if (posHit.length) {
      out.push("--- adversarial positives the DETERMINISTIC layer DID catch ---");
      posHit.forEach((c) => out.push(`  [${c.category}] ${c.text.slice(0, 60)}`));
    }
    writeFileSync(path.join(process.cwd(), "evals/redteam-report.txt"), out.join("\n"));

    expect(redteam.length).toBeGreaterThan(30);
    // Regression gate: the adversarial benign set must not start over-firing.
    // Bound set just above the observed baseline (see redteam-report.txt).
    expect(negHit.length).toBeLessThanOrEqual(REDTEAM_FP_BOUND);
  });
});
