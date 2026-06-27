import { describe, it, expect, vi, afterEach } from "vitest";
import { rerankByRelevance, getRerankMinScore } from "./rerank";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("rerankByRelevance", () => {
  it("returns null when EMBEDDING_API_KEY is missing (reranking unavailable)", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "");
    expect(await rerankByRelevance("失眠", [{ id: "a", text: "x" }])).toBeNull();
  });

  it("returns null for empty docs", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "sk-x");
    expect(await rerankByRelevance("失眠", [])).toBeNull();
  });

  it("maps provider relevance scores back to card ids by index", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "sk-x");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            { index: 1, relevance_score: 0.93 },
            { index: 0, relevance_score: 0.004 }
          ]
        })
      }))
    );
    const out = await rerankByRelevance("失眠睡不着", [
      { id: "who-depression", text: "..." },
      { id: "cbti-insomnia", text: "..." }
    ]);
    expect(out).toEqual([
      { id: "cbti-insomnia", score: 0.93 },
      { id: "who-depression", score: 0.004 }
    ]);
  });

  it("never throws — non-ok response and fetch errors both yield null", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "sk-x");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await rerankByRelevance("q", [{ id: "a", text: "x" }])).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    expect(await rerankByRelevance("q", [{ id: "a", text: "x" }])).toBeNull();
  });
});

describe("getRerankMinScore", () => {
  it("defaults to 0.3 and honours RERANK_MIN_SCORE", () => {
    vi.stubEnv("RERANK_MIN_SCORE", "");
    expect(getRerankMinScore()).toBeCloseTo(0.3, 6);
    vi.stubEnv("RERANK_MIN_SCORE", "0.5");
    expect(getRerankMinScore()).toBeCloseTo(0.5, 6);
  });
});
