import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { assessRisk, getDangerLevel, assessConversationRisk } from "./safety";

// TEMP probe — ground-truth the negation behavior. Delete after.
const cases = [
  "我不想自杀",
  "我没有自杀的念头",
  "我不会自杀",
  "我不想死",
  "我不想活了", // MUST stay danger
  "我想自杀", // MUST stay danger
  "不想活着", // MUST stay danger
  "活着没什么意思", // danger-ish
  "我不想自杀，但我有计划", // MUST stay danger (other-risk)
  "我不是想自杀，我是想直接消失", // tricky — should stay flagged
  "最近压力大睡不着", // safe
];

describe("neg probe", () => {
  it("writes levels", () => {
    const lines = cases.map((c) => {
      const a = assessRisk(c);
      const conv = assessConversationRisk([{ role: "user", content: c }]);
      return `[${c}] single.level=${a.level} single.danger=${getDangerLevel(a)} | conv.level=${conv.level} conv.danger=${getDangerLevel(conv)} | terms=${a.matchedTerms.join("/")}`;
    });
    writeFileSync("/tmp/probe_result.txt", lines.join("\n"));
  });
});
