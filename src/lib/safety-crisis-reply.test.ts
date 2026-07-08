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

// 2026-07-08 (owner directive): the live templates no longer ask the 1–4 question in
// text — the crisis banner buttons do. classifyCrisisCheckReply must STILL recognize
// legacy history that contains the old in-text legends, so the scale tests below use
// verbatim legacy-legend fixtures (frozen copies of the pre-2026-07-08 lines), not the
// current template output.
const crisisPromptZh = "如果你能回复，请只回一个数字：1=我已经移开危险物品，2=我身边有人，3=我准备打电话，4=我现在做不到。";
const crisisPromptEn = "If you can reply, send only one number: 1=I moved dangerous items away, 2=someone is with me, 3=I am about to call, 4=I cannot do this right now.";
const severityPromptZh = "你可以只回一个数字：1=我现在安全但很痛苦，2=我有伤害自己的念头但没有计划，3=我有计划或工具在身边，4=我不确定。";
const severityPromptEn = "You can reply with only one number: 1=I am safe but in a lot of pain, 2=I have thoughts of hurting myself but no plan, 3=I have a plan or method nearby, 4=I am not sure.";

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

  // 2026-07-05 (product owner directive, D2/D4): the crisis resource block no longer
  // asks "reply with one number" in text (see createCrisisResourceBlock's comment) —
  // that question is now asked via the crisis banner's 1–4 buttons instead. A caller
  // that KNOWS the digit came from those buttons (the route's crisisModeActive branch)
  // passes assumeAsked so this still classifies a bare digit even though prior text
  // carries no question at all. Falls back to the severity scale (no scale marker in
  // the prior text) — same default as an unclear/ambiguous prompt.
  it("assumeAsked classifies a bare digit even when the prior text asks nothing (button path)", () => {
    expect(classifyCrisisCheckReply("3", "随便什么回复", { assumeAsked: true })).toEqual({
      digit: 3,
      tier: "escalate"
    });
    expect(classifyCrisisCheckReply("1", "随便什么回复", { assumeAsked: true })).toEqual({
      digit: 1,
      tier: "stabilize"
    });
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
  // 2026-07-08 owner directive: hotline enumeration moved OUT of reply text entirely —
  // it lives in the crisis banner (tel: links) / CrisisSheet / global footer. The
  // fixed templates keep the empathic + concrete-steps body only.
  it("the fixed templates carry no hotline enumeration in either language", () => {
    const en = createCrisisResponse(assessment, { language: "en" });
    const zh = createCrisisResponse(assessment, { language: "zh" });
    for (const t of [en, zh]) {
      expect(t).not.toContain("116 123");
      expect(t).not.toContain("13 11 14");
      expect(t).not.toContain("findahelpline.com");
      expect(t).not.toContain("12356");
      expect(t).not.toContain("110/120");
    }
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

// 2026-07-08 (product owner directive): the appended resource block is REMOVED from
// the product — crisis replies end with the empathic/action body; hotlines and the 1–4
// check-in live only in the crisis banner / CrisisSheet / global footer UI. These
// assertions lock that: no hotline wall, no numeric legend, no rescue disclaimer in
// any fixed template, in either mode/language.
describe("2026-07-08 owner-directed removal — no in-text block, legend, or disclaimer", () => {
  const zhCrisis = createCrisisResponse(assessment, { language: "zh" });
  const enCrisis = createCrisisResponse(assessment, { language: "en" });
  const zhConcern = createSuicideConcernResponse("zh");
  const enConcern = createSuicideConcernResponse("en");

  it("zh/en crisis + concern templates drop the retired lines", () => {
    for (const t of [zhCrisis, enCrisis, zhConcern, enConcern]) {
      expect(t).not.toContain("请只回一个数字");
      expect(t).not.toContain("你可以只回一个数字");
      expect(t).not.toContain("only one number");
      expect(t).not.toContain("北京");
      expect(t).not.toContain("希望24");
      expect(t).not.toContain("不是紧急救援");
      expect(t).not.toContain("not emergency rescue");
      expect(t).not.toContain("无论如何，这些随时可用");
      expect(t).not.toContain("━━━━━━━━");
    }
  });

  it("templates still keep the emergency-call ACTION and the safety steps", () => {
    expect(zhCrisis).toContain("急救电话");
    expect(zhCrisis).toContain("移到够不到的地方");
    expect(zhConcern).toContain("联系急救服务");
    expect(enCrisis.toLowerCase()).toContain("emergency number");
  });

  it("the 1–4 button escalate reply still carries real hotlines (targeted moment, kept)", () => {
    expect(createCrisisReplyResponse("escalate", "zh")).toContain("12356");
  });
});
