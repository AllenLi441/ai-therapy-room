import { describe, expect, it } from "vitest";
import { defaultTurnPlan } from "./case-formulation";
import { retrieveKnowledge } from "./knowledge";
import { resolvePersona } from "./personas";
import { buildCounselorSystemPrompt } from "./prompts";
import { assessRisk } from "./safety";
import { emptyCaseMap } from "./types";

describe("buildCounselorSystemPrompt", () => {
  it("injects boundaries, profile, safety, knowledge, turn plan, and case map", async () => {
    const prompt = buildCounselorSystemPrompt({
      profile: { nickname: "小林", concern: "焦虑压力", intensity: 7 },
      risk: assessRisk("最近很焦虑"),
      knowledge: await retrieveKnowledge("焦虑 心慌"),
      caseMap: {
        ...emptyCaseMap(),
        presenting: "工作压力下持续焦虑",
        triggers: ["项目 deadline"],
        workingHypothesis: "压力→反刍→失眠→白天功能下降→更焦虑"
      },
      turnPlan: {
        ...defaultTurnPlan(),
        modality: "CBT",
        protocolStep: "CBT-思维记录第 1 步：标定情境"
      },
      scaleResults: [
        { id: "GAD-7", total: 12, severity: "中度焦虑", answers: [], completedAt: "" }
      ],
      persona: resolvePersona("companion")
    });

    expect(prompt).toContain("不能诊断");
    expect(prompt).toContain("安屿");
    expect(prompt).toContain("心理陪伴者");
    expect(prompt).toContain("不要声称自己是医生");
    expect(prompt).toContain("督导给本轮的工作要点");
    expect(prompt).toContain("当前个案概念化");
    expect(prompt).toContain("CBT-思维记录第 1 步：标定情境");
    expect(prompt).toContain("工作压力下持续焦虑");
    expect(prompt).toContain("GAD-7");
    expect(prompt).toContain("小林");
    expect(prompt).toContain("当前情绪强度：7/10");
    expect(prompt).toContain("情绪命名与共情");
  });

  it("injects an internal scale safety directive when PHQ-9 item 9 is endorsed", () => {
    const prompt = buildCounselorSystemPrompt({
      profile: { nickname: "阿明", concern: "情绪低落", intensity: 8 },
      risk: assessRisk("最近不太好"),
      knowledge: [],
      caseMap: null,
      turnPlan: defaultTurnPlan(),
      scaleResults: [
        { id: "PHQ-9", total: 18, severity: "中重度抑郁倾向", answers: [2, 2, 2, 2, 2, 2, 2, 2, 2], completedAt: "2026-06-08T00:00:00.000Z" }
      ]
    });

    expect(prompt).toContain("量表安全提示");
    expect(prompt).toContain("自伤念头条目");
    // The directive must instruct the model NOT to recite the score/label back.
    expect(prompt).toContain("不要对来访者复述量表得分或标签");
    expect(prompt).toContain("⚠️量表自伤条目被勾选");
  });

  it("omits the scale safety directive when no self-harm/severe signal is present", () => {
    const prompt = buildCounselorSystemPrompt({
      profile: { nickname: "", concern: "", intensity: 3 },
      risk: assessRisk("还行"),
      knowledge: [],
      caseMap: null,
      turnPlan: defaultTurnPlan(),
      scaleResults: [
        { id: "GAD-7", total: 6, severity: "轻度焦虑", answers: [1, 1, 1, 1, 1, 1, 0], completedAt: "" }
      ]
    });

    expect(prompt).not.toContain("量表安全提示");
  });

  it("falls back gracefully when case map is empty", () => {
    const prompt = buildCounselorSystemPrompt({
      profile: { nickname: "", concern: "说不清", intensity: 5 },
      risk: assessRisk("最近不太好"),
      knowledge: [],
      caseMap: null,
      turnPlan: defaultTurnPlan()
    });

    expect(prompt).toContain("首次接触，概念化尚未形成");
    expect(prompt).toContain("没有命中特定知识卡");
  });

  // P3-c: pace shapes the output. 快速 drops the 4-step structure for a short
  // reply; 深度 (and the default) keeps the full structure.
  it("fast pace gives a short reply shape; deep keeps the 4-step structure", () => {
    const base = {
      risk: assessRisk("还行"),
      knowledge: [],
      caseMap: null,
      turnPlan: defaultTurnPlan()
    };
    const deep = buildCounselorSystemPrompt({ ...base, pace: "deep" as const });
    const fast = buildCounselorSystemPrompt({ ...base, pace: "fast" as const });
    const dflt = buildCounselorSystemPrompt(base);

    expect(deep).toContain("结构必须是");
    expect(dflt).toContain("结构必须是");   // default (no pace) stays deep
    expect(fast).not.toContain("结构必须是");
    expect(fast).toContain("用 1-2 句");
  });
});
