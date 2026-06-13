import { describe, expect, it } from "vitest";
import {
  decodeSessionPlanHeader,
  defaultTurnPlan,
  encodeSessionPlanHeader
} from "./case-formulation";
import { emptyCaseMap } from "./types";

describe("session plan header codec", () => {
  it("round trips a session plan via base64", () => {
    const plan = {
      caseMap: {
        ...emptyCaseMap(),
        presenting: "考试焦虑反复发作",
        triggers: ["每次模拟考前一天"],
        workingHypothesis: "担忧→失眠→白天疲倦→自我怀疑→更担忧"
      },
      turnPlan: {
        ...defaultTurnPlan(),
        modality: "CBT" as const,
        protocolStep: "CBT-思维记录第 1 步"
      }
    };

    const encoded = encodeSessionPlanHeader(plan);
    const decoded = decodeSessionPlanHeader(encoded);

    expect(decoded?.caseMap.presenting).toBe("考试焦虑反复发作");
    expect(decoded?.turnPlan.modality).toBe("CBT");
  });

  it("returns null for malformed header values", () => {
    expect(decodeSessionPlanHeader("not-base64-or-json")).toBeNull();
  });
});
