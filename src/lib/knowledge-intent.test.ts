import { describe, it, expect } from "vitest";
import { isInfoSeeking } from "./knowledge";

describe("isInfoSeeking — RAG only grounds info-seeking turns, venting stays card-free", () => {
  it("venting / pure emotion → NOT info-seeking (no KB grounding)", () => {
    for (const v of [
      "今天好烦啊",
      "唉，最近老是睡不着，翻来覆去的，心里挺烦的",
      "跟朋友闹得不太愉快，心里堵得慌",
      "我好难过",
      "最近什么都提不起劲"
    ]) {
      expect(isInfoSeeking(v)).toBe(false);
    }
  });

  it("explicit info / method / question → info-seeking", () => {
    for (const q of [
      "失眠怎么办",
      "有什么科学的方法可以改善焦虑吗",
      "我是不是抑郁了？",
      "社交场合紧张该怎么应对",
      "正念冥想有用吗",
      "how do i deal with panic attacks"
    ]) {
      expect(isInfoSeeking(q)).toBe(true);
    }
  });

  it("empty / whitespace → false", () => {
    expect(isInfoSeeking("")).toBe(false);
    expect(isInfoSeeking("   ")).toBe(false);
  });
});
