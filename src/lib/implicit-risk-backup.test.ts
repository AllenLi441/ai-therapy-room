import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateDeepSeekText } from "@/lib/deepseek";
import { generateKimiText } from "@/lib/kimi";
import {
  __resetKimiJudgeCircuitForTests,
  assessImplicitRiskWithLLM,
  decideImplicitIntercept
} from "./implicit-risk";
import type { ChatMessage, RiskAssessment } from "./types";

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

// 熔断是模块级状态、mock 的 once 队列会跨用例泄漏 —— 每个用例前双双复位。
// (vitest 的 resetAllMocks 会把实现恢复为 vi.mock 工厂里传给 vi.fn 的原始实现。)
beforeEach(() => {
  vi.resetAllMocks();
  __resetKimiJudgeCircuitForTests();
});

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

// 错误感知重试 + 熔断(任务 A)。分类见 classifyKimiJudgeError;重试仅限
// 可重试类别 × 快败(≤2.5s) × 深度档(timeoutMs ≥ 10s),恰好一次。
const VALID_JUDGE_JSON = JSON.stringify({
  severity: "suicidal_ideation",
  pragmatic: "self",
  modifiers: ["hopelessness"],
  evidence: ["我觉得活着没意义了"],
  confidence: 0.8,
  suggested_flags: ["suicide_concern"],
  rationale: "kimi retry classification"
});

function lex(over: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    level: "none",
    categories: [],
    matchedTerms: [],
    flags: [],
    shouldEscalate: false,
    rationale: "",
    ...over
  };
}

describe("assessImplicitRiskWithLLM — error-aware retry + circuit breaker (task A)", () => {
  it("① RATE 快败(elapsed<2.5s)→ 恰好重试一次成功,judgedBy=kimi", async () => {
    vi.useFakeTimers();
    try {
      mockedGenerateKimiText
        .mockRejectedValueOnce(new Error("Kimi API error 429: rate limit reached, too many requests"))
        .mockResolvedValueOnce(VALID_JUDGE_JSON);
      const pending = assessImplicitRiskWithLLM(messages);
      await vi.advanceTimersByTimeAsync(1000); // RATE 退避 1s
      const outcome = await pending;
      expect(outcome.kind).toBe("ok");
      if (outcome.kind === "ok") {
        expect(outcome.result.judgedBy).toBe("kimi");
        expect(outcome.result.fallbackReason).toBeUndefined();
      }
      expect(mockedGenerateKimiText).toHaveBeenCalledTimes(2);
      // 重试预算 = min(8000, timeoutMs 12000 − elapsed 0(假时钟) − 退避 1000) = 8000
      expect(mockedGenerateKimiText.mock.calls[1][1]).toBe(8000);
      expect(mockedGenerateDeepSeekText).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("② PERMANENT(suspended)→ 零重试直落兜底,fallbackReason=kimi_billing,熔断已开", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mockedGenerateKimiText.mockRejectedValueOnce(new Error("Kimi API error 401: account suspended"));
      const outcome = await assessImplicitRiskWithLLM(messages);
      expect(outcome.kind).toBe("ok");
      if (outcome.kind === "ok") {
        expect(outcome.result.judgedBy).toBe("deepseek");
        expect(outcome.result.fallbackReason).toBe("kimi_billing");
      }
      expect(mockedGenerateKimiText).toHaveBeenCalledTimes(1); // 零重试

      // 跳闸时打且仅打一条单行 JSON
      expect(errSpy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(errSpy.mock.calls[0][0] as string);
      expect(line.event).toBe("kimi_judge_circuit_open");
      expect(line.until).toBeTruthy();

      // 熔断已开:下一轮完全跳过 Kimi,直接备胎
      const second = await assessImplicitRiskWithLLM(messages);
      expect(mockedGenerateKimiText).toHaveBeenCalledTimes(1);
      if (second.kind === "ok") expect(second.result.fallbackReason).toBe("kimi_circuit_open");
      expect(errSpy).toHaveBeenCalledTimes(1); // 开启期间不再重复打
    } finally {
      errSpy.mockRestore();
    }
  });

  it("③ Kimi+DeepSeek 双败 → error outcome,fail-safe 阶梯与改动前完全一致", async () => {
    mockedGenerateKimiText.mockRejectedValueOnce(new Error("kimi down again"));
    mockedGenerateDeepSeekText.mockRejectedValueOnce(new Error("deepseek also down"));
    const outcome = await assessImplicitRiskWithLLM(messages);
    expect(outcome.kind).toBe("error");
    expect(mockedGenerateKimiText).toHaveBeenCalledTimes(1); // 未知错误形状不重试

    // decideImplicitIntercept 的 fail-safe 决策逐级对照(改动前行为):
    // lexicon=none → 放行
    expect(decideImplicitIntercept(outcome, lex())).toMatchObject({
      intercept: false,
      source: "fail_safe_release"
    });
    // lexicon=low 且自杀相邻 → 保守升级 suicide_concern
    expect(
      decideImplicitIntercept(outcome, lex({ level: "low", flags: ["suicide_concern"] }))
    ).toMatchObject({ intercept: true, mode: "suicide_concern", source: "fail_safe" });
    // lexicon=low 但泛化(无自杀相邻信号)→ 放行
    expect(decideImplicitIntercept(outcome, lex({ level: "low" }))).toMatchObject({
      intercept: false,
      source: "fail_safe_release"
    });
    // lexicon ≥ medium → lexicon 流程已接管
    expect(decideImplicitIntercept(outcome, lex({ level: "medium" }))).toMatchObject({
      intercept: false,
      source: "fail_safe_release"
    });
  });

  it("④ 本地超时 → 不重试,直落兜底,fallbackReason=kimi_timeout", async () => {
    mockedGenerateKimiText.mockRejectedValueOnce(new Error("Kimi response timed out"));
    const outcome = await assessImplicitRiskWithLLM(messages);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.result.judgedBy).toBe("deepseek");
      expect(outcome.result.fallbackReason).toBe("kimi_timeout");
    }
    expect(mockedGenerateKimiText).toHaveBeenCalledTimes(1);
  });

  it("⑤ 熔断开启期间 → Kimi 完全未被调用,兜底预算放宽为 12s", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // 先用 billing 错误跳闸
      mockedGenerateKimiText.mockRejectedValueOnce(new Error("Kimi API error 403: insufficient balance"));
      await assessImplicitRiskWithLLM(messages);
      mockedGenerateKimiText.mockClear();
      mockedGenerateDeepSeekText.mockClear();

      vi.useFakeTimers();
      try {
        // 兜底挂起不返回 → 用假时钟量出预算:旧默认 6s 会在 6000ms 断,放宽后 12000ms 才断
        mockedGenerateDeepSeekText.mockImplementationOnce(() => new Promise<never>(() => {}));
        let settled = false;
        const pending = assessImplicitRiskWithLLM(messages).then((o) => {
          settled = true;
          return o;
        });
        await vi.advanceTimersByTimeAsync(11_999);
        expect(settled).toBe(false); // 已越过旧 6s 预算仍在等 → 预算确实放宽
        await vi.advanceTimersByTimeAsync(2);
        const outcome = await pending;
        expect(settled).toBe(true);
        expect(outcome.kind).toBe("error"); // 兜底超时 → 原 fail-safe 阶梯
        expect(mockedGenerateKimiText).not.toHaveBeenCalled();
        expect(mockedGenerateDeepSeekText).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    } finally {
      errSpy.mockRestore();
    }
  });
});
