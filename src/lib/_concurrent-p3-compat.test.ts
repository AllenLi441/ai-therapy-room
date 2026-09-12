import { describe, it, expect } from "vitest";
import { assessRisk } from "./safety";

// Retain word-internal evasion coverage while preserving the sentence boundaries
// required by safety-normalization-reconcile.test.ts. Full stops and ellipses
// must not fabricate risk terms by joining otherwise separate text.
describe("CJK normalization precision and evasion regression", () => {
  it("recognizes word-internal dashes and middle dots", () => {
    for (const text of ["自-杀", "自·杀", "自—杀"]) {
      const r = assessRisk(text);
      expect(r.level, text).toBe("high");
      expect(r.categories, text).toContain("suicide");
    }
  });
  it("preserves full stops and ellipses as boundaries", () => {
    for (const text of ["自。杀", "自.杀", "我想…死"]) {
      const r = assessRisk(text);
      expect(r.shouldEscalate, text).toBe(false);
      expect(r.categories, text).not.toContain("suicide");
    }
  });
  it("normalizes chained word separators without removing sentence boundaries", () => {
    expect(assessRisk("自-·-杀").level).toBe("high");
    expect(assessRisk("自-。·杀").shouldEscalate).toBe(false);
  });
  it("zero-width", () => {
    expect(assessRisk("自​杀").level).toBe("high");
  });
  it("fullwidth pinyin", () => {
    expect(assessRisk("ｗｏ ｂｕ ｘｉａｎｇ ｈｕｏ").level).toBe("high");
  });
  it("fullwidth english", () => {
    expect(assessRisk("ｉ ｗａｎｔ ｔｏ ｄｉｅ").level).toBe("high");
  });
  it("traditional high-risk", () => {
    for (const text of ["自殺", "輕生", "結束生命", "我想跳樓"]) {
      const r = assessRisk(text);
      expect(r.level, text).toBe("high");
    }
  });
  it("traditional medium 活著沒意思", () => {
    expect(assessRisk("我覺得活著沒意思").level).toBe("medium");
  });
  it("no fabricated danger across full-stop", () => {
    const r = assessRisk("我今天去了图书馆。明天准备去公园散步。");
    expect(r.level).toBe("none");
    expect(r.categories).not.toContain("suicide");
  });
  it("comma-separated benign unmerged", () => {
    const r = assessRisk("我换了块手表，表带也换了。");
    expect(r.categories).not.toContain("suicide");
  });

  // CROSS-SENTENCE FP PROBES — the risk of stripping 。 between CJK: a period that
  // is a real sentence boundary could merge two benign halves into a danger token.
  it("does NOT fabricate danger across a real sentence-boundary period", () => {
    for (const text of [
      "这个项目终于结束。生命在于运动，我要去跑步了。", // 结束。生命 → 结束生命?
      "会议结束。生活还要继续，加油。",
      "课程到此结束。生命科学下学期再学。",
      "我把这章写完就结束。死党约我打球去了。" // 结束。死 → 结束死?
    ]) {
      const r = assessRisk(text);
      expect(r.categories, text).not.toContain("suicide");
      expect(r.flags, text).not.toContain("suicide_concern");
    }
  });
});
