import { describe, expect, it } from "vitest";
import { DEFAULT_PERSONA_ID, THERAPY_PERSONAS, formatPersonaForPrompt, resolvePersona } from "./personas";

describe("therapy personas", () => {
  it("resolves unknown persona ids to the default persona", () => {
    expect(resolvePersona("unknown").id).toBe(DEFAULT_PERSONA_ID);
  });

  it("defines visible avatars and prompt-safe professional boundaries", () => {
    // 2026-06-13: collapsed from 4 personas to ONE integrative companion (安屿).
    expect(THERAPY_PERSONAS).toHaveLength(1);

    for (const persona of THERAPY_PERSONAS) {
      expect(persona.image).toMatch(/^\/personas\/.+\.(png|webp|jpg|jpeg)$/);
      expect(persona.starterPrompts.length).toBeGreaterThanOrEqual(3);
      expect(formatPersonaForPrompt(persona)).toContain("不要声称自己是医生");
      expect(formatPersonaForPrompt(persona)).toContain(persona.name);
    }
  });

  // P3-c: the deepened voice — concrete sample lines + wording rules + a pace that
  // actually changes the tone (not just adjectives).
  it("carries concrete voice content into the prompt (sample lines + wording rules)", () => {
    const p = resolvePersona("companion");
    const out = formatPersonaForPrompt(p);
    expect(out).toContain("声音定位");
    expect(out).toContain(p.sampleLines[0]);          // a real sample utterance
    expect(out).toContain("措辞规则");
    expect(p.sampleLines.length).toBeGreaterThanOrEqual(3);
  });

  it("folds pace into the voice — 深度 and 快速 produce different tone guidance", () => {
    const p = resolvePersona("companion");
    const deep = formatPersonaForPrompt(p, "deep");
    const fast = formatPersonaForPrompt(p, "fast");
    expect(deep).toContain(p.pace.deep);
    expect(fast).toContain(p.pace.fast);
    expect(deep).not.toBe(fast);
  });
});
