import { describe, it, expect } from "vitest";
import { assessRisk } from "./safety";

/**
 * P3 normalization — reconciliation of two concurrent sessions' implementations
 * (2026-06-09). Final design = NFKC fullwidth fold + zero-width strip + UNION'd
 * Traditional→Simplified map + interior-noise stripping for the hyphen/dash/
 * middot/tilde/star family ONLY. Period/ellipsis stripping (proposed by the other
 * session to catch 自。杀 / 我想…死) was EMPIRICALLY REJECTED — it false-positives on
 * real sentence boundaries (结束。生命 → 结束生命). Contrived period/ellipsis evasions
 * are handled by the Kimi semantic layer, keeping the deterministic layer FP-clean.
 */
describe("P3 normalization — what the deterministic layer catches", () => {
  it("hyphen/dash/middot/tilde/star/underscore inserted between CJK danger chars", () => {
    for (const text of ["自-杀", "自·杀", "自—杀", "自~杀", "自*杀", "自_杀", "自・杀"]) {
      const r = assessRisk(text);
      expect(r.level, text).toBe("high");
      expect(r.categories, text).toContain("suicide");
    }
  });
  it("strips a run of interior noise (自-·-杀)", () => {
    expect(assessRisk("自-·-杀").level).toBe("high");
  });
  it("zero-width characters between CJK", () => {
    expect(assessRisk("自​杀").level).toBe("high"); // U+200B
  });
  it("fullwidth pinyin folded onto the lexicon", () => {
    expect(assessRisk("ｗｏ ｂｕ ｘｉａｎｇ ｈｕｏ").level).toBe("high");
  });
  it("fullwidth English folded onto the lexicon", () => {
    expect(assessRisk("ｉ ｗａｎｔ ｔｏ ｄｉｅ").level).toBe("high");
  });
  it("Traditional high-risk tokens folded onto the Simplified lexicon", () => {
    for (const text of ["自殺", "輕生", "結束生命", "我想跳樓"]) {
      expect(assessRisk(text).level, text).toBe("high");
    }
  });
  it("Traditional medium 活著沒意思 (union map fixes 著→着)", () => {
    expect(assessRisk("我覺得活著沒意思").level).toBe("medium");
  });
});

describe("P3 normalization — precision guards (must stay FP-clean)", () => {
  it("does NOT fabricate danger across a real sentence-boundary period", () => {
    // The reason period/ellipsis stripping was rejected.
    for (const text of [
      "这个项目终于结束。生命在于运动，我要去跑步了。",
      "会议结束。生活还要继续，加油。",
      "课程到此结束。生命科学下学期再学。"
    ]) {
      const r = assessRisk(text);
      expect(r.categories, text).not.toContain("suicide");
      expect(r.flags, text).not.toContain("suicide_concern");
    }
  });
  it("does not merge benign clauses across a full-stop or comma", () => {
    expect(assessRisk("我今天去了图书馆。明天准备去公园散步。").level).toBe("none");
    expect(assessRisk("我换了块手表，表带也换了。").categories).not.toContain("suicide");
  });
  it("DOCUMENTED: bare period/ellipsis evasions are deferred to the Kimi layer (deterministic none)", () => {
    // Not a miss to fix in the lexicon — asserting the boundary so it's a conscious choice.
    expect(assessRisk("自。杀").level).toBe("none");
    expect(assessRisk("我想…死").level).toBe("none");
  });
});
