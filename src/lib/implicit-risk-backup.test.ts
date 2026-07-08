import { describe, expect, it, vi } from "vitest";
import { generateDeepSeekText } from "@/lib/deepseek";
import { generateKimiText } from "@/lib/kimi";
import { assessImplicitRiskWithLLM } from "./implicit-risk";
import type { ChatMessage } from "./types";

// Task D — DeepSeek backup judge. When Kimi throws, assessImplicitRiskWithLLM must
// give DeepSeek one bounded attempt before falling to the original fail-safe ladder.
vi.mock("@/lib/kimi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kimi")>();
  return {
    ...actual,
    isKimiConfigured: vi.fn(() => true),
    generateKimiText: vi.fn(async () => {
      throw new Error("kimi down");
    })
  };
});

vi.mock("@/lib/deepseek", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/deepseek")>();
  return {
    ...actual,
    getDeepSeekConfig: vi.fn(() => ({
      apiKey: "test-deepseek-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash"
    })),
    generateDeepSeekText: vi.fn(async () =>
      JSON.stringify({
        severity: "suicidal_ideation",
        pragmatic: "self",
        modifiers: ["hopelessness"],
        evidence: ["我觉得活着没意义了"],
        confidence: 0.8,
        suggested_flags: ["suicide_concern"],
        rationale: "deepseek backup classification"
      })
    )
  };
});

const mockedGenerateKimiText = vi.mocked(generateKimiText);
const mockedGenerateDeepSeekText = vi.mocked(generateDeepSeekText);

const messages: ChatMessage[] = [{ role: "user", content: "我觉得活着没意义了" }];

describe("assessImplicitRiskWithLLM — DeepSeek backup judge (task D)", () => {
  it("Kimi throws, DeepSeek backup answers with a valid classification → kind ok, judgedBy deepseek", async () => {
    const outcome = await assessImplicitRiskWithLLM(messages);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.result.judgedBy).toBe("deepseek");
      expect(outcome.result.severity).toBe("suicidal_ideation");
    }
  });

  it("both Kimi and DeepSeek fail → kind error (original fail-safe unchanged)", async () => {
    mockedGenerateKimiText.mockRejectedValueOnce(new Error("kimi down again"));
    mockedGenerateDeepSeekText.mockRejectedValueOnce(new Error("deepseek also down"));
    const outcome = await assessImplicitRiskWithLLM(messages);
    expect(outcome.kind).toBe("error");
  });
});
