import { describe, expect, it } from "vitest";
import { isolateEvalCredentials } from "../../eval/adapters/env";

describe("evaluation credential isolation", () => {
  it("removes production credentials when dedicated evaluation keys are absent", () => {
    const env: NodeJS.ProcessEnv = {
      DEEPSEEK_API_KEY: "production-deepseek",
      KIMI_API_KEY: "production-kimi",
      EMBEDDING_API_KEY: "production-embedding",
    };
    const sources = isolateEvalCredentials(env);
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(env.KIMI_API_KEY).toBeUndefined();
    expect(env.EMBEDDING_API_KEY).toBeUndefined();
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
    expect(sources.DEEPSEEK_API_KEY).toBe("EVAL_DEEPSEEK_API_KEY");
  });

  it("preserves production credentials only with the explicit override", () => {
    const env: NodeJS.ProcessEnv = {
      EVAL_ALLOW_PRODUCTION_KEYS: "1",
      DEEPSEEK_API_KEY: "production-deepseek",
    };
    const sources = isolateEvalCredentials(env);
    expect(env.DEEPSEEK_API_KEY).toBe("production-deepseek");
    expect(sources.DEEPSEEK_API_KEY).toBe("explicit-production-override");
  });
});
