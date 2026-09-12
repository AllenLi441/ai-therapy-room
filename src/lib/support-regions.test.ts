import { describe, expect, it } from "vitest";
import { assessRisk, createCrisisReplyResponse, createGlobalSafetyFooter, createMinorSupportLine, getRiskInstruction } from "./safety";
import { normalizeSupportRegion, parseSupportRegion, SUPPORT_REGION_CODES, SUPPORT_REGIONS, minorSupportResources } from "./support-regions";
import { parseRecordBackup } from "../components/jingshi/session-state";

describe("shared support-region contract", () => {
  it.each(SUPPORT_REGION_CODES)("preserves %s in a record backup and makes its support available in both languages", (code) => {
    const backup = parseRecordBackup({ format: "jingshi-records", version: 1, messages: [{ id: "synthetic", role: "user", content: "合成迁移记录" }], sessions: [], settings: { supportRegion: code } });
    expect(backup.settings.supportRegion).toBe(code);
    expect(backup.messages[0].content).toBe("合成迁移记录");
    expect(SUPPORT_REGIONS[code].resources.length).toBeGreaterThan(0);
    for (const resource of SUPPORT_REGIONS[code].resources) {
      expect(resource.label.zh).toBeTruthy(); expect(resource.label.en).toBeTruthy();
      expect(resource.href).toMatch(/^(?:tel:\+?\d+|https:\/\/\S+)$/);
    }
    for (const lang of ["zh", "en"] as const) {
      const minorLine = createMinorSupportLine(lang, code);
      for (const resource of minorSupportResources(code)) expect(minorLine).toContain(resource.number ?? resource.href);
      expect(minorLine).toContain(lang === "zh" ? "其他安全的成年人" : "another safe adult");
      for (const resource of SUPPORT_REGIONS[code].resources) {
        expect(createCrisisReplyResponse("escalate", lang, code)).toContain(resource.number ?? resource.href);
        expect(createGlobalSafetyFooter(lang, code)).toContain(resource.number ?? resource.href);
      }
    }
  });

  it("keeps old combined UK/Ireland settings without guessing either country", () => {
    expect(normalizeSupportRegion("UK_IE")).toBe("UK_IE");
    expect(normalizeSupportRegion("uk")).toBe("UK_IE");
    expect(normalizeSupportRegion("UK")).toBe("UK");
    expect(normalizeSupportRegion("IE")).toBe("IE");
    expect(parseRecordBackup({ format: "jingshi-records", version: 1, messages: [], sessions: [], settings: { supportRegion: "UK_IE" } }).settings.supportRegion).toBe("UK_IE");
  });

  it("accepts legacy API casing while rejecting unknown or prototype keys", () => {
    expect(parseSupportRegion("cn")).toBe("CN");
    expect(parseSupportRegion("us")).toBe("US");
    for (const value of [null, {}, "unsupported", "constructor", "__proto__"]) {
      expect(parseSupportRegion(value)).toBeNull(); expect(normalizeSupportRegion(value)).toBe("OTHER");
    }
  });

  it.each(["zh", "en"] as const)("defaults legacy safety helpers to a directory instead of inferring a country from %s", (language) => {
    for (const text of [createCrisisReplyResponse("escalate", language), createGlobalSafetyFooter(language)]) {
      expect(text).toContain("findahelpline.com");
      expect(text).not.toMatch(/12356|988|911|116 123|13 11 14/);
    }
  });

  it("points crisis generation to the existing support UI rather than promising an appended hotline block", () => {
    const instruction = getRiskInstruction(assessRisk("我现在想自杀"));
    expect(instruction).toContain("真人支持 / Human support");
    expect(instruction).not.toContain("自动附上");
  });
});
