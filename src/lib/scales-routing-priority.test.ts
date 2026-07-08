import { describe, expect, it } from "vitest";
import { suggestScale } from "./scales";

// Guards the 2026-06-08 eval fix: comorbid/mixed presentations must route by
// clinical priority PHQ-9 (depression) > GAD-7 (anxiety) > ISI (insomnia), NOT by
// raw keyword-match count. PHQ-9 item 9 screens self-harm — routing a depressed
// user to ISI just because insomnia had more keyword hits would miss that screen.

describe("suggestScale — clinical priority for comorbid presentations", () => {
  it("depression + insomnia → PHQ-9 (was ISI: the eval bug)", () => {
    // 低落+麻木 (2 PHQ-9 hits) vs 失眠+睡不着+半夜醒 (3 ISI hits): PHQ-9 must win.
    expect(suggestScale("我最近很低落、整个人麻木，还失眠，每天睡不着、半夜醒")).toBe("PHQ-9");
  });

  it("depression + anxiety → PHQ-9", () => {
    expect(suggestScale("我又很焦虑、总担心，又觉得低落、提不起劲")).toBe("PHQ-9");
  });

  it("pure insomnia → ISI (priority does NOT over-promote PHQ-9 when it has no match)", () => {
    expect(suggestScale("我就是睡不着、失眠、半夜醒、凌晨还醒")).toBe("ISI");
  });

  it("pure anxiety → GAD-7", () => {
    expect(suggestScale("我特别焦虑、很紧张、总担心、心慌")).toBe("GAD-7");
  });

  it("pure depression → PHQ-9", () => {
    expect(suggestScale("我很低落、没意思、提不起劲、空虚")).toBe("PHQ-9");
  });

  it("insomnia-dominant with incidental anxiety word stays ISI (no false promotion)", () => {
    // 困+凌晨+睡 (ISI) outweigh the lone 停不下来 (GAD-7); only PHQ-9 is hard-promoted.
    expect(suggestScale("我晚上很困，但每天都拖到凌晨才睡，脑子停不下来。")).toBe("ISI");
  });

  it("no symptom keywords → null", () => {
    expect(suggestScale("今天天气不错，我们去爬山吧")).toBeNull();
  });
});
