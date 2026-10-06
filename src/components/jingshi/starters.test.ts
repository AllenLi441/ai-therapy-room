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

  it("puts openers related to past sessions first, and stays random for generic history", () => {
    const fixed = () => 0.5;
    const exams = pickStarters("zh", "minor", 3, fixed, "期末考试快到了，压力很大，晚上睡不着");
    expect(exams.filter((text) => /考|睡/.test(text)).length).toBeGreaterThanOrEqual(2);
    expect(pickStarters("zh", "adult", 3, fixed, "和男朋友吵架了，他不在乎我")).toContain("和伴侣总是吵架");
    expect(pickStarters("en", "adult", 3, fixed, "I had a fight with my boss today")).toContain("My boss always finds fault with me");
    // Only everyday words: same as no history at all.
    expect(pickStarters("zh", "adult", 3, fixed, "感觉有点累，最近不知道怎么了")).toEqual(pickStarters("zh", "adult", 3, fixed));
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
