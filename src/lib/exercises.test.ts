import { describe, expect, it } from "vitest";
import { THERAPY_EXERCISES, formatExercisePrompt, getExerciseById, suggestExercise } from "./exercises";

describe("therapy exercises", () => {
  it("exposes the expected structured practice set", () => {
    expect(THERAPY_EXERCISES.map((exercise) => exercise.method)).toEqual([
      "ACT",
      "CBT",
      "DBT",
      "ACT",
      "睡眠",
      "关系"
    ]);
  });

  it("formats filled exercise answers into a counseling prompt", () => {
    const exercise = getExerciseById("relationship-script");
    const prompt = formatExercisePrompt(exercise, {
      fact: "你这两天没有回我消息。",
      feeling: "我有点不安。",
      request: "希望你能直接告诉我需要空间。"
    });

    expect(prompt).toContain("关系练习：关系表达");
    expect(prompt).toContain("事实：你这两天没有回我消息。");
    expect(prompt).toContain("请求：希望你能直接告诉我需要空间。");
    expect(prompt).not.toContain("需要：");
  });

  it("suggests exercises from conversation context", () => {
    expect(suggestExercise("我晚上很困，但拖到凌晨都不睡。")).toBe("sleep-reset");
    expect(suggestExercise("他两天没回消息，我想质问但又怕。")).toBe("relationship-script");
    expect(suggestExercise("我突然很慌，手发麻，感觉快失控了。")).toBe("dbt-grounding");
    expect(suggestExercise("我脑子里一直有个念头停不下来。")).toBe("act-defusion");
  });
});
