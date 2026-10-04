import { describe, expect, it } from "vitest";
import { isolateEvalCredentials } from "../../eval/adapters/env";

describe("evaluation credential isolation", () => {
  it("removes production credentials when dedicated evaluation keys are absent", () => {
    const env: NodeJS.ProcessEnv = {
      DEEPSEEK_API_KEY: "production-deepseek",
      KIMI_API_KEY: "production-kimi",
      EMBEDDING_API_KEY: "production-embedding",
      SILICONFLOW_API_KEY: "production-siliconflow",
    };
    const sources = isolateEvalCredentials(env);
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(env.KIMI_API_KEY).toBeUndefined();
    expect(env.EMBEDDING_API_KEY).toBeUndefined();
    expect(env.SILICONFLOW_API_KEY).toBeUndefined();
    expect(sources.DEEPSEEK_API_KEY).toBe("disabled-no-dedicated-eval-key");
  });

  it("maps dedicated keys into production modules only inside the eval process", () => {
    const env: NodeJS.ProcessEnv = {
      DEEPSEEK_API_KEY: "production-deepseek",
      EVAL_DEEPSEEK_API_KEY: "evaluation-deepseek",
      EVAL_KIMI_API_KEY: "evaluation-kimi",
      EVAL_EMBEDDING_API_KEY: "evaluation-embedding",
    };
    const sources = isolateEvalCredentials(env);
    expect(env.DEEPSEEK_API_KEY).toBe("evaluation-deepseek");
    expect(env.KIMI_API_KEY).toBe("evaluation-kimi");
    expect(env.EMBEDDING_API_KEY).toBe("evaluation-embedding");
    expect(env.KIMI_PROVIDER).toBe("moonshot");
    expect(sources.DEEPSEEK_API_KEY).toBe("EVAL_DEEPSEEK_API_KEY");
  });

  it("preserves production credentials only with the explicit override", () => {
    const env: NodeJS.ProcessEnv = {
      EVAL_ALLOW_PRODUCTION_KEYS: "1",
      DEEPSEEK_API_KEY: "production-deepseek",
      SILICONFLOW_API_KEY: "production-siliconflow",
    };
    const sources = isolateEvalCredentials(env);
    expect(env.DEEPSEEK_API_KEY).toBe("production-deepseek");
    expect(env.SILICONFLOW_API_KEY).toBe("production-siliconflow");
    expect(sources.DEEPSEEK_API_KEY).toBe("explicit-production-override");
  });

  it("supports a dedicated SiliconFlow judge without retaining a production Moonshot key", () => {
    const env: NodeJS.ProcessEnv = {
      EVAL_KIMI_PROVIDER: "siliconflow", EVAL_SILICONFLOW_API_KEY: "evaluation-siliconflow",
      KIMI_API_KEY: "production-kimi", SILICONFLOW_API_KEY: "production-siliconflow",
      EVAL_EMBEDDING_API_KEY: "evaluation-embedding",
    };
    isolateEvalCredentials(env);
    expect(env.KIMI_PROVIDER).toBe("siliconflow");
    expect(env.SILICONFLOW_API_KEY).toBe("evaluation-siliconflow");
    expect(env.KIMI_API_KEY).toBeUndefined();
  });

  it("cannot auto-select the embedding account as an unconfigured judge", () => {
    const env: NodeJS.ProcessEnv = {
      KIMI_PROVIDER: "siliconflow", EVAL_EMBEDDING_API_KEY: "evaluation-embedding",
      EMBEDDING_BASE_URL: "https://api.siliconflow.com/v1",
    };
    isolateEvalCredentials(env);
    expect(env.EMBEDDING_API_KEY).toBe("evaluation-embedding");
    expect(env.KIMI_PROVIDER).toBe("moonshot");
    expect(env.KIMI_API_KEY).toBeUndefined();
    expect(env.SILICONFLOW_API_KEY).toBeUndefined();
  });

  it.each([
    { EVAL_KIMI_PROVIDER: "other" },
    { EVAL_KIMI_PROVIDER: "siliconflow", EVAL_KIMI_API_KEY: "moonshot" },
    { EVAL_SILICONFLOW_API_KEY: "siliconflow" },
    { EVAL_KIMI_PROVIDER: "moonshot" },
    { EVAL_KIMI_PROVIDER: "siliconflow", EVAL_SILICONFLOW_API_KEY: "siliconflow", EVAL_KIMI_API_KEY: "moonshot" },
  ])("rejects incompatible provider credentials before changing runtime keys: %j", (config) => {
    const env = { ...config, DEEPSEEK_API_KEY: "untouched-production" };
    expect(() => isolateEvalCredentials(env)).toThrow("评测判官配置冲突");
    expect(env.DEEPSEEK_API_KEY).toBe("untouched-production");
  });
});
