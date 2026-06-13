import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { assessRisk, getDangerLevel, assessConversationRisk } from "./safety";

// TEMP probe — verify EN fixes. Delete after.
const cases = [
  // reassurance → MUST be safe (none)
  "I don't want to kill myself",
  "I am not suicidal",
  "I have no thoughts of suicide",
  // FP candidate (left fail-safe, like 我不想死)
  "I don't want to die",
  // real danger → MUST be high
  "I want to kill myself",
  "I want to die",
  "I don't want to live anymore",
  "I do not want to live anymore",
  "I don't want to be alive anymore",
  "I have pills next to me and I'm done",
  // BENIGN → MUST be none (no new false positives)
  "I don't want to live in this city anymore",
  "I want to live my best life",
  "I don't want to kill this process",
  "I've been so stressed lately and can't sleep",
  "I don't want to be alive at 6am for this meeting",
];

describe("en probe v2", () => {
  it("writes levels", () => {
    const lines = cases.map((c) => {
      const a = assessRisk(c);
      const conv = assessConversationRisk([{ role: "user", content: c }]);
      return `[${c}] -> level=${a.level} danger=${getDangerLevel(a)} convDanger=${getDangerLevel(conv)} terms=${a.matchedTerms.join("/")}`;
    });
    writeFileSync("/tmp/probe_en2.txt", lines.join("\n"));
  });
});
