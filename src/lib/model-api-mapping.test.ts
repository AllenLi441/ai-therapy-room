import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_MODEL_OPTIONS,
  DEFAULT_DEEPSEEK_MODEL,
  toDeepSeekApiModel
} from "./model-options";

// Guards the 2026-06-08 fix: the provider API only accepts deepseek-v4-pro /
// deepseek-v4-flash; the v5.5 UI tier ids must map to those, or every chat call
// 400s ("unknown model") → empty stream → the reply stalls at the holding line.
const VALID_API_MODELS = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);

describe("toDeepSeekApiModel", () => {
  it("maps EVERY UI model id to a provider-accepted API model name", () => {
    for (const option of DEEPSEEK_MODEL_OPTIONS) {
      expect(VALID_API_MODELS.has(toDeepSeekApiModel(option.id))).toBe(true);
    }
  });

  it("the default model resolves to a valid API model", () => {
    expect(VALID_API_MODELS.has(toDeepSeekApiModel(DEFAULT_DEEPSEEK_MODEL))).toBe(true);
  });

  it("preserves the pro/flash tier through mapping", () => {
    expect(toDeepSeekApiModel("deepseek-v5.5-pro")).toBe("deepseek-v4-pro");
    expect(toDeepSeekApiModel("deepseek-v5.5-flash")).toBe("deepseek-v4-flash");
  });

  it("falls back to a valid model for unknown/garbage input", () => {
    expect(VALID_API_MODELS.has(toDeepSeekApiModel("not-a-real-model"))).toBe(true);
    expect(VALID_API_MODELS.has(toDeepSeekApiModel(undefined))).toBe(true);
  });
});
