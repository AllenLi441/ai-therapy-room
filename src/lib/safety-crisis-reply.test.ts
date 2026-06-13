import { describe, expect, it } from "vitest";
import {
  classifyCrisisCheckReply,
  createCrisisReplyResponse,
  createCrisisResponse,
  createSuicideConcernResponse
} from "./safety";
import type { RiskAssessment } from "./types";

const assessment: RiskAssessment = {
  level: "high",
  categories: [],
  matchedTerms: [],
  flags: ["suicide_concern"],
  shouldEscalate: true,
  rationale: ""
};

// The full crisis template uses the ACTION scale (3 = "about to call" = good).
const crisisPromptZh = createCrisisResponse(assessment, { language: "zh" });
const crisisPromptEn = createCrisisResponse(assessment, { language: "en" });
// The suicide-concern template uses the SEVERITY scale (3 = plan/method = bad).
const severityPromptZh = createSuicideConcernResponse("zh");
const severityPromptEn = createSuicideConcernResponse("en");

describe("classifyCrisisCheckReply — scale-aware 1–4 parsing", () => {
  it("crisis-action scale: only 4 escalates, 1–3 stabilize", () => {
    expect(classifyCrisisCheckReply("4", crisisPromptZh)).toEqual({ digit: 4, tier: "escalate" });
    expect(classifyCrisisCheckReply("3", crisisPromptZh)).toEqual({ digit: 3, tier: "stabilize" });
    expect(classifyCrisisCheckReply("1", crisisPromptZh)).toEqual({ digit: 1, tier: "stabilize" });
    expect(classifyCrisisCheckReply("4", crisisPromptEn)).toEqual({ digit: 4, tier: "escalate" });
    expect(classifyCrisisCheckReply("3", crisisPromptEn)).toEqual({ digit: 3, tier: "stabilize" });
  });

  it("severity scale: 3 and 4 escalate, 1–2 stabilize", () => {
    expect(classifyCrisisCheckReply("3", severityPromptZh)).toEqual({ digit: 3, tier: "escalate" });
    expect(classifyCrisisCheckReply("4", severityPromptZh)).toEqual({ digit: 4, tier: "escalate" });
    expect(classifyCrisisCheckReply("2", severityPromptZh)).toEqual({ digit: 2, tier: "stabilize" });
    expect(classifyCrisisCheckReply("1", severityPromptEn)).toEqual({ digit: 1, tier: "stabilize" });
    expect(classifyCrisisCheckReply("3", severityPromptEn)).toEqual({ digit: 3, tier: "escalate" });
  });

  it("only fires when the assistant just asked for a number", () => {
    expect(classifyCrisisCheckReply("3", "你今天过得怎么样？想聊聊吗？")).toBeNull();
    expect(classifyCrisisCheckReply("3", "How was your day?")).toBeNull();
  });

  it("ignores non-check messages that merely contain a digit", () => {
    expect(classifyCrisisCheckReply("我有3个朋友可以联系", severityPromptZh)).toBeNull();
    expect(classifyCrisisCheckReply("第一次发作大概3年前", severityPromptZh)).toBeNull();
    const long = "3，不过其实我想了很多事情，今天发生了太多，一时不知道从哪里说起才好呢";
    expect(classifyCrisisCheckReply(long, severityPromptZh)).toBeNull();
  });

  it("tolerates light wrapping around the number", () => {
    expect(classifyCrisisCheckReply("  3 ", severityPromptZh)).toEqual({ digit: 3, tier: "escalate" });
    expect(classifyCrisisCheckReply("选4", severityPromptZh)).toEqual({ digit: 4, tier: "escalate" });
    expect(classifyCrisisCheckReply("4 我现在做不到", crisisPromptZh)).toEqual({ digit: 4, tier: "escalate" });
    // echoing the short option label (which itself contains 但) still counts
    expect(classifyCrisisCheckReply("1=安全但很痛苦", severityPromptZh)).toEqual({ digit: 1, tier: "stabilize" });
  });
});

describe("createCrisisReplyResponse — tiered follow-up", () => {
  it("escalate pushes hard to real-world help with multi-region hotlines", () => {
    const en = createCrisisReplyResponse("escalate", "en");
    expect(en).toContain("988");
    expect(en).toContain("116 123");
    expect(en).toContain("13 11 14");
    expect(en).toContain("findahelpline.com");
    const zh = createCrisisReplyResponse("escalate", "zh");
    expect(zh).toContain("12356");
    expect(zh).toContain("116 123");
  });

  it("stabilize affirms the step and keeps the escalation path open", () => {
    const zh = createCrisisReplyResponse("stabilize", "zh");
    expect(zh).toContain("念头变强");
    expect(zh).toMatch(/急救|身边的人/);
    const en = createCrisisReplyResponse("stabilize", "en");
    expect(en.toLowerCase()).toContain("emergency");
  });
});

describe("crisis template hotlines + concise opener", () => {
  it("the full English crisis template now lists UK/AU/international lines", () => {
    expect(crisisPromptEn).toContain("116 123");
    expect(crisisPromptEn).toContain("13 11 14");
    expect(crisisPromptEn).toContain("findahelpline.com");
  });

  it("concise opener is a short first-beat on the severity scale", () => {
    const conciseEn = createCrisisResponse(assessment, { language: "en", concise: true });
    expect(conciseEn).toContain("one number");
    // concise uses the severity scale, NOT the action scale
    expect(conciseEn).not.toContain("moved dangerous items away");
    expect(conciseEn.length).toBeLessThan(crisisPromptEn.length);
    // a reply against the concise prompt is therefore read on the severity scale
    expect(classifyCrisisCheckReply("3", conciseEn)).toEqual({ digit: 3, tier: "escalate" });

    const conciseZh = createCrisisResponse(assessment, { language: "zh", concise: true });
    expect(conciseZh).toContain("一个数字");
    expect(conciseZh.length).toBeLessThan(crisisPromptZh.length);
  });
});
