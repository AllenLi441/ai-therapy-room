import { describe, expect, it } from "vitest";
import { scoreScale } from "./scales";

// Guards PHQ-9 severity band boundaries (inclusive min/max in scoreFromBands)
// against off-by-one regressions that would silently misclassify symptom
// severity. Item 9 (index 8) is held at 0 so the sentinel-alert path does not
// interfere with the band assertions.
describe("PHQ-9 severity band boundaries", () => {
  const sev = (items: number[]) => scoreScale("PHQ-9", items)?.severity;

  it("4 -> normal, 5 -> mild (4/5 boundary)", () => {
    expect(scoreScale("PHQ-9", [3, 1, 0, 0, 0, 0, 0, 0, 0])?.total).toBe(4);
    expect(sev([3, 1, 0, 0, 0, 0, 0, 0, 0])).toBe("极轻或正常范围");
    expect(scoreScale("PHQ-9", [3, 2, 0, 0, 0, 0, 0, 0, 0])?.total).toBe(5);
    expect(sev([3, 2, 0, 0, 0, 0, 0, 0, 0])).toBe("轻度抑郁倾向");
  });

  it("9 -> mild, 10 -> moderate (9/10 boundary)", () => {
    expect(sev([3, 3, 3, 0, 0, 0, 0, 0, 0])).toBe("轻度抑郁倾向");
    expect(sev([3, 3, 3, 1, 0, 0, 0, 0, 0])).toBe("中度抑郁倾向");
  });

  it("14 -> moderate, 15 -> moderately-severe (14/15 boundary)", () => {
    expect(sev([3, 3, 3, 3, 2, 0, 0, 0, 0])).toBe("中度抑郁倾向");
    expect(sev([3, 3, 3, 3, 3, 0, 0, 0, 0])).toBe("中重度抑郁倾向");
  });

  it("19 -> moderately-severe, 20 -> severe (19/20 boundary)", () => {
    expect(sev([3, 3, 3, 3, 3, 3, 1, 0, 0])).toBe("中重度抑郁倾向");
    expect(sev([3, 3, 3, 3, 3, 3, 2, 0, 0])).toBe("重度抑郁倾向");
  });
});
