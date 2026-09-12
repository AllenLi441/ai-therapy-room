import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeepSeekPayload } from "./deepseek";
import {
  DEEPSEEK_MODEL_OPTIONS,
  DEFAULT_DEEPSEEK_MODEL,
  resolveApiModelForPace
} from "./model-options";

afterEach(() => vi.unstubAllEnvs());

const input = { systemPrompt: "system", messages: [{ role: "user" as const, content: "hello" }] };

// The current production route selects apiModel by session pace; legacy model
// picker IDs are ignored by the payload builder. Exercise that real boundary,
// not the removed toDeepSeekApiModel helper. These are offline configuration
// assertions, not evidence of live provider availability.
describe("production model selection in provider payload", () => {
  it.each([
    { pace: "deep", expected: "deepseek-v4-pro", thinking: "enabled" },
    { pace: "fast", expected: "deepseek-v4-flash", thinking: "disabled" }
  ])("$pace uses its configured API model despite the legacy picker value", ({ pace, expected, thinking }) => {
    vi.stubEnv("DEEPSEEK_MODEL", expected === "deepseek-v4-pro" ? "deepseek-v4-flash" : "deepseek-v4-pro");
    for (const option of DEEPSEEK_MODEL_OPTIONS) {
      const payload = buildDeepSeekPayload({ ...input, model: option.id, apiModel: resolveApiModelForPace(pace) });
      expect(payload.model, option.id).toBe(expected);
      expect(payload.thinking).toEqual({ type: thinking });
    }
  });

  it("the default or unknown pace uses the configured deep model in the actual payload", () => {
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-flash");
    for (const pace of [undefined, "not-a-pace"]) {
      expect(buildDeepSeekPayload({ ...input, model: DEFAULT_DEEPSEEK_MODEL, apiModel: resolveApiModelForPace(pace) }).model)
        .toBe("deepseek-v4-pro");
    }
  });

  it("non-pace callers use a valid server setting and never send legacy UI IDs", () => {
    vi.stubEnv("DEEPSEEK_MODEL", " deepseek-v4-pro ");
    for (const option of DEEPSEEK_MODEL_OPTIONS) {
      expect(buildDeepSeekPayload({ ...input, model: option.id }).model).toBe("deepseek-v4-pro");
    }
  });

  it("unknown explicit and environment values fall back before reaching the provider payload", () => {
    for (const envModel of ["", "not-a-real-model", "deepseek-v5.5-pro"]) {
      vi.stubEnv("DEEPSEEK_MODEL", envModel);
      for (const apiModel of [undefined, "not-a-real-model", "deepseek-v5.5-flash"]) {
        expect(buildDeepSeekPayload({ ...input, model: DEFAULT_DEEPSEEK_MODEL, apiModel }).model)
          .toBe("deepseek-v4-flash");
      }
    }
  });
});
