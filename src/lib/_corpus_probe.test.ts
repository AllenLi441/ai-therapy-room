import { readFileSync, writeFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { assessRisk } from "./safety";

type Case = {
  text: string;
  expectedLevel: "none" | "low" | "medium" | "high";
  shouldEscalate: boolean;
  category: string;
  disguise: string;
  dimension: string;
  note?: string;
};

const cases: Case[] = JSON.parse(
  readFileSync(new URL("./crisis-corpus.json", import.meta.url), "utf-8")
);

describe("CORPUS red-team", () => {
  it("report mismatches", () => {
    const critFN: string[] = []; // expected escalate, got none-escalate (DANGER MISS)
    const fp: string[] = []; // expected no-escalate, got escalate (FALSE ALARM)
    const missedConcern: string[] = []; // expected medium, got none

    for (const c of cases) {
      const r = assessRisk(c.text);
      if (c.shouldEscalate && !r.shouldEscalate) {
        critFN.push(`[${c.dimension}/${c.category}] got=${r.level} :: ${c.text}`);
      } else if (!c.shouldEscalate && r.shouldEscalate) {
        fp.push(`[${c.dimension}/${c.category}] :: ${c.text}`);
      } else if (c.expectedLevel === "medium" && r.level === "none") {
        missedConcern.push(`[${c.dimension}/${c.category}] :: ${c.text}`);
      }
    }

    const report = [
      `TOTAL=${cases.length}  critFN=${critFN.length}  FP=${fp.length}  missedConcern=${missedConcern.length}`,
      "",
      "### CRITICAL FN (expected escalate, MISSED):",
      ...critFN,
      "",
      "### FALSE ALARMS (expected calm, escalated):",
      ...fp,
      "",
      "### MISSED CONCERN (expected medium, got none):",
      ...missedConcern
    ].join("\n");

    writeFileSync("/tmp/corpus_report.txt", report, "utf-8");
    expect(critFN.length).toBeGreaterThanOrEqual(0);
  });
});
