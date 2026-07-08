import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { assessRisk, getDangerLevel } from "./safety";

const cases: Array<[string, string]> = [
  // FP fixed → expect none
  ["我不想死", "safe"],
  ["这道题想死我了", "safe"],
  ["我不想死记硬背这些公式", "safe"],
  ["想死你了，好久不见", "safe"],
  ["笑死我了想死你了", "safe"],
  // real danger → expect high
  ["我想死", "HIGH"],
  ["我真的想死", "HIGH"],
  ["好想死", "HIGH"],
  ["我想死了", "HIGH"],
  ["我有时想死有时又不想死", "HIGH(ambivalence)"],
  ["我又想死又不想死", "HIGH(ambivalence)"],
  // miss fixed → expect high
  ["我不想活着", "HIGH(was MISS)"],
  ["我不想活着了", "HIGH(was MISS)"],
  ["真的不想活下去了", "HIGH"],
  // denial still works (reassurance) → none
  ["我没想过自杀", "safe"],
  ["我不会自杀", "safe"],
  // 想死 benign but OTHER danger present → MUST still fire
  ["想死我了，而且我准备好药了", "HIGH(other-risk)"],
  ["我不想死，但我有自杀计划", "HIGH(other-risk)"],
];

describe("zh probe v2", () => {
  it("writes", () => {
    const lines = cases.map(([c, expect]) => {
      const a = assessRisk(c);
      const got = getDangerLevel(a) >= 3 ? "HIGH" : a.level;
      return `[${c}] want=${expect} got=${got} terms=${a.matchedTerms.join("/")}`;
    });
    writeFileSync("/tmp/probe_zh2.txt", lines.join("\n"));
  });
});
