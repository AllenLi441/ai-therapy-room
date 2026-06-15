import { describe, expect, it } from "vitest";
import { CN_PRIMARY_HOTLINES, CN_SUPPLEMENTAL, INTL_RESOURCES } from "./crisis-resources";
import { assessRisk, createCrisisResponse, createSuicideConcernResponse } from "./safety";

// v2 / 3a — single source of truth for crisis resources. This guards two things:
// (1) the canonical list is intact; (2) the LIVE safety templates still contain
// every canonical number. (2) locks current behavior so the upcoming SSOT refactor
// of safety.ts (templates reading from crisis-resources.ts) must stay byte-equal on
// the numbers. If a refactor drops or changes a number, this fails.

describe("crisis-resources — single source of truth", () => {
  it("canonical CN primary hotlines are intact (12356 / 110 / 120)", () => {
    expect(CN_PRIMARY_HOTLINES.map((h) => h.number)).toEqual(["12356", "110", "120"]);
    expect(CN_PRIMARY_HOTLINES.map((h) => h.id)).toEqual(["psych", "police", "medical"]);
  });

  it("the crisis template contains every canonical resource (behavior lock)", () => {
    const zh = createCrisisResponse(assessRisk("我真的不想活了"), { language: "zh" });
    expect(zh).toContain("12356");
    expect(zh).toContain("110/120");
    expect(zh).toContain(CN_SUPPLEMENTAL.beijing); // 010-82951332
    expect(zh).toContain(CN_SUPPLEMENTAL.hope24);  // 400-161-9995
    expect(zh).toContain(INTL_RESOURCES.usCrisis); // 988
  });

  it("the suicide_concern template contains the CN psych + supplemental lines", () => {
    const zh = createSuicideConcernResponse("zh");
    expect(zh).toContain("12356");
    expect(zh).toContain(CN_SUPPLEMENTAL.beijing);
    expect(zh).toContain(CN_SUPPLEMENTAL.hope24);
  });
});
