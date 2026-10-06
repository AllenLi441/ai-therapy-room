import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES } from "@/lib/languages";
import { assessRisk, hasMinorContextCue } from "@/lib/safety";
import { ADULT_STARTERS, TEEN_STARTERS, pickStarters, starterAudience } from "./starters";

const POOLS = { teen: TEEN_STARTERS, adult: ADULT_STARTERS } as const;

describe("welcome starters", () => {
  it("has 100 distinct openers per audience and language", () => {
    for (const pool of Object.values(POOLS)) {
      for (const lang of LANGUAGE_CODES) {
        const list = pool[lang];
        expect(list, lang).toHaveLength(100);
        expect(new Set(list).size, lang).toBe(100);
        expect(list.every((text) => text.trim() === text && text.length > 0), lang).toBe(true);
      }
    }
  });

  it("never trips a safety route by itself", () => {
    for (const [audience, pool] of Object.entries(POOLS)) {
      for (const lang of LANGUAGE_CODES) {
        for (const text of pool[lang]) {
          const risk = assessRisk(text);
          // "low" is ordinary distress wording (紧张, 焦虑, 睡不着) and stays on the normal path.
          expect(["none", "low"], `${audience}/${lang}: ${text}`).toContain(risk.level);
          expect(risk.shouldEscalate, `${audience}/${lang}: ${text}`).toBe(false);
          expect(risk.flags, `${audience}/${lang}: ${text}`).toEqual([]);
        }
      }
    }
  });

  it("keeps school-age cues out of the adult Chinese pool", () => {
    for (const text of [...ADULT_STARTERS.zh, ...ADULT_STARTERS["zh-Hant"]]) {
      expect(hasMinorContextCue(text), text).toBe(false);
    }
  });

  it("uses the teen pool only for under-18, and draws three distinct openers", () => {
    expect(starterAudience("minor")).toBe("teen");
    expect(starterAudience("adult")).toBe("adult");
    expect(starterAudience("unspecified")).toBe("adult");
    const picked = pickStarters("zh", "minor");
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(picked.every((text) => TEEN_STARTERS.zh.includes(text))).toBe(true);
    let seed = 1;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    expect(pickStarters("ja", "adult", 3, random).every((text) => ADULT_STARTERS.ja.includes(text))).toBe(true);
  });
});
