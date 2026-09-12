import { describe, expect, it } from "vitest";
import { detectRisk, detectScaleNeed } from "./data";

describe("client safety and scale routing", () => {
  it("does not raise the crisis banner for an explicit denial of self-harm thoughts", () => {
    expect(detectRisk("我没有自杀的想法，只是最近睡不着")).toBe(false);
  });

  it("still raises support for a direct first-person statement", () => {
    expect(detectRisk("我现在想自杀")).toBe(true);
  });

  it("prioritizes PHQ-9 for mixed low mood and sleep concerns", () => {
    expect(detectScaleNeed("我最近很低落、整个人麻木，还失眠，每天睡不着、半夜醒")).toBe("PHQ-9");
  });

  it("uses the same mixed-concern priority in English", () => {
    expect(detectScaleNeed("I feel depressed and I can't sleep")).toBe("PHQ-9");
  });

  it("keeps a sleep-only concern on ISI", () => {
    expect(detectScaleNeed("我最近睡不太好")).toBe("ISI");
  });
});
