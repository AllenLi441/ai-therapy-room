import { describe, it, expect } from "vitest";
import { hasMinorContextCue, createMinorSupportLine } from "./safety";

describe("hasMinorContextCue — augments safety copy for likely minors (recall-leaning, low-harm)", () => {
  it("fires on student / school / age cues (user is the minor)", () => {
    for (const t of [
      "我才16岁，最近一直觉得活着没意思",
      "我今年十五岁，撑不下去了",
      "被全班霸凌，不想上学也不想活了",
      "我读初三，爸妈不让我说这些，我好累",
      "高考压力太大了，我不想活了",
      "I'm in high school and I don't want to be here anymore",
      "my classmates keep bullying me and I can't do this"
    ]) {
      expect(hasMinorContextCue(t), t).toBe(true);
    }
  });

  it("does NOT fire when the user is the adult caregiver / clearly an adult", () => {
    for (const t of [
      "我是老师，班里有个学生说想自杀，我该怎么帮他", // teacher about a student
      "我女儿最近不想上学，我很担心",               // parent about a child
      "我儿子上初中，最近情绪很差",
      "我32岁，工作压力大到喘不过气",
      "我在读研，导师天天施压，我撑不住了",         // grad student / adult
      "my kid is being bullied at school and I don't know what to do"
    ]) {
      expect(hasMinorContextCue(t), t).toBe(false);
    }
  });

  it("does NOT fire with no minor cue at all, or empty", () => {
    expect(hasMinorContextCue("最近工作压力好大，睡不好")).toBe(false);
    expect(hasMinorContextCue("")).toBe(false);
    expect(hasMinorContextCue("我18岁了，刚成年")).toBe(false); // 18 is not 12–17
  });
});

describe("createMinorSupportLine — age-appropriate youth referral", () => {
  it("zh routes to a trusted adult + youth hotlines (12355/12356)", () => {
    const zh = createMinorSupportLine("zh");
    expect(zh).toContain("信任的成年人");
    expect(zh).toContain("12355");
  });
  it("en routes to a trusted adult + youth lines (988 / 741741)", () => {
    const en = createMinorSupportLine("en");
    expect(en.toLowerCase()).toContain("trusted adult");
    expect(en).toContain("988");
    expect(en).toContain("741741");
  });
});
