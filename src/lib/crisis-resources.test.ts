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

  // 2026-07-08 owner directive (behavior lock INVERTED): reply text carries NO numbers;
  // the canonical resources are delivered by the crisis banner / CrisisSheet / footer,
  // which read from THIS module (single source of truth). The escalate tier reply is
  // the one deliberate in-text exception (fires only after a 3/4 severity button).
  it("the crisis/concern templates carry no hotline numbers (moved to banner UI)", () => {
    const zh = createCrisisResponse(assessRisk("我真的不想活了"), { language: "zh" });
    const concern = createSuicideConcernResponse("zh");
    for (const t of [zh, concern]) {
      expect(t).not.toContain("12356");
      expect(t).not.toContain("110/120");
      expect(t).not.toContain(CN_SUPPLEMENTAL.beijing);
      expect(t).not.toContain(CN_SUPPLEMENTAL.hope24);
      expect(t).not.toContain(INTL_RESOURCES.usCrisis);
    }
  });

  it("the canonical resource constants stay exported for the banner/CrisisSheet UI", () => {
    expect(CN_SUPPLEMENTAL.beijing).toBe("010-82951332");
    expect(CN_SUPPLEMENTAL.hope24).toBe("400-161-9995");
    expect(INTL_RESOURCES.usCrisis).toContain("988");
  });
});
