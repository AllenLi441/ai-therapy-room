import { describe, expect, it } from "vitest";
import {
  assessRisk,
  createCrisisResponse,
  createCrisisReplyResponse,
  createMinorSupportLine,
  createSuicideConcernResponse
} from "./safety";

// v2 / 3a — BYTE-EQUIVALENCE GUARD for the SSOT refactor of safety.ts crisis
// templates. These snapshots freeze the EXACT current rendered output of every
// crisis template that embeds a hotline number. After the refactor (templates
// reading numbers from crisis-resources.ts) `vitest run` MUST pass with ZERO
// snapshot updates. Any diff = the refactor changed user-facing crisis text → fix.
//
// ⚠️ The frozen text in the .snap IS live crisis content. Changing it is a
// clinical-review item (see _SAFETY_v2_DRAFTS_待评审.md), NOT a refactor step.

const crisisAssessment = assessRisk("我真的不想活了");

describe("crisis templates — byte-equivalence snapshots (behavior lock)", () => {
  it("createCrisisResponse zh", () => {
    expect(createCrisisResponse(crisisAssessment, { language: "zh" })).toMatchSnapshot();
  });
  it("createCrisisResponse en", () => {
    expect(createCrisisResponse(crisisAssessment, { language: "en" })).toMatchSnapshot();
  });
  it("createSuicideConcernResponse zh", () => {
    expect(createSuicideConcernResponse("zh")).toMatchSnapshot();
  });
  it("createSuicideConcernResponse en", () => {
    expect(createSuicideConcernResponse("en")).toMatchSnapshot();
  });
  it("createMinorSupportLine zh", () => {
    expect(createMinorSupportLine("zh")).toMatchSnapshot();
  });
  it("createMinorSupportLine en", () => {
    expect(createMinorSupportLine("en")).toMatchSnapshot();
  });
  it("createCrisisReplyResponse escalate zh", () => {
    expect(createCrisisReplyResponse("escalate", "zh")).toMatchSnapshot();
  });
  it("createCrisisReplyResponse escalate en", () => {
    expect(createCrisisReplyResponse("escalate", "en")).toMatchSnapshot();
  });
});
