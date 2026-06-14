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
});
