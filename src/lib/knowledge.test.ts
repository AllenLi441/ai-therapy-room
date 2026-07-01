import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeCard } from "./types";
import type { EmbeddingProvider } from "./embeddings";

// Tier-1 dependencies are mocked so the tests exercise retrieveKnowledge's WIRING without
// any network: qdrantDenseSearch is fully controllable; rerankByRelevance is stubbed to a
// no-op so we can assert fast mode never calls it (and it never does a real /rerank fetch).
vi.mock("./qdrant", () => ({
  qdrantDenseSearch: vi.fn(),
  // Default configured=true so the existing Tier-1 tests exercise the Qdrant path.
  isQdrantConfigured: vi.fn(() => true)
}));
vi.mock("./rerank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rerank")>();
  return { ...actual, rerankByRelevance: vi.fn(async () => null) };
});

import {
  cosineSimilarity,
  keywordRetrieve,
  keywordScore,
  normalize,
  retrieveKnowledge,
  topK,
  vectorRetrieve
} from "./knowledge";
import { qdrantDenseSearch, isQdrantConfigured } from "./qdrant";
import { rerankByRelevance } from "./rerank";

const mockedQdrant = vi.mocked(qdrantDenseSearch);
const mockedRerank = vi.mocked(rerankByRelevance);
const mockedQdrantConfigured = vi.mocked(isQdrantConfigured);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mockedQdrant.mockReset();
  mockedRerank.mockReset();
  mockedRerank.mockResolvedValue(null);
  mockedQdrantConfigured.mockReset();
  mockedQdrantConfigured.mockReturnValue(true);
});

const card = (over: Partial<KnowledgeCard> & { id: string }): KnowledgeCard => ({
  title: "",
  tags: [],
  keywords: [],
  content: "",
  guidance: [],
  ...over
});

// A fake provider that returns a fixed query vector — no network.
const fakeProvider = (queryVec: number[]): EmbeddingProvider => ({
  id: "openai:text-embedding-3-small",
  dim: queryVec.length,
  embed: async () => [queryVec]
});

describe("pure: cosineSimilarity", () => {
  it("is 1 for identical direction, 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("returns 0 for length mismatch or a zero vector", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("pure: normalize", () => {
  it("min-max scales to 0..1", () => {
    expect(normalize([0, 5, 10])).toEqual([0, 0.5, 1]);
  });
  it("maps all-equal to all 1", () => {
    expect(normalize([3, 3, 3])).toEqual([1, 1, 1]);
  });
});

describe("pure: topK", () => {
  it("orders by score desc and respects the limit", () => {
    expect(topK(["a", "b", "c"], [0.1, 0.9, 0.5], 2)).toEqual(["b", "c"]);
  });
  it("is stable for ties (original order)", () => {
    expect(topK(["a", "b", "c"], [1, 1, 1], 3)).toEqual(["a", "b", "c"]);
  });
  it("limit <= 0 returns []", () => {
    expect(topK(["a"], [1], 0)).toEqual([]);
  });
});

describe("pure: keywordScore", () => {
  const c = card({
    id: "k1",
    title: "惊恐发作",
    tags: ["焦虑"],
    keywords: ["心慌", "呼吸急促"]
  });

  it("an exact keyword match scores at least its base weight", () => {
    expect(keywordScore(c, "我突然心慌")).toBeGreaterThanOrEqual(1.0);
  });
  it("a keyword match outscores the same term matched only as a tag", () => {
    const asKw = card({ id: "a", keywords: ["心慌"] });
    const asTag = card({ id: "b", tags: ["心慌"] });
    expect(keywordScore(asKw, "我心慌")).toBeGreaterThan(keywordScore(asTag, "我心慌"));
  });
  it("a more specific keyword outranks a generic one (specificity weighting)", () => {
    const specific = card({ id: "exam", keywords: ["考试焦虑"] });
    const generic = card({ id: "gen", keywords: ["焦虑"] });
    const q = "我一到考试焦虑得不行";
    expect(keywordScore(specific, q)).toBeGreaterThan(keywordScore(generic, q));
  });
  it("recall net: a paraphrase with NO exact keyword match still scores > 0 via shared bigrams", () => {
    const ctrl = card({ id: "ctrl", title: "被父母控制", keywords: ["父母管太多", "什么都要插手"] });
    expect(keywordScore(ctrl, "父母什么都要管，一点自己的空间都没有")).toBeGreaterThan(0);
  });
  it("a totally unrelated query scores 0", () => {
    expect(keywordScore(c, "披萨和可乐")).toBe(0);
  });
});

describe("keywordRetrieve", () => {
  const cards = [
    card({ id: "panic", title: "惊恐", keywords: ["心慌", "呼吸急促"], tags: ["焦虑"] }),
    card({ id: "sleep", title: "失眠", keywords: ["睡不着", "失眠"], tags: ["睡眠"] }),
    card({ id: "low", title: "低落", keywords: ["没意思", "提不起劲"], tags: ["抑郁"] })
  ];

  it("returns the strongest lexical match, top-k, zero-score dropped", () => {
    const out = keywordRetrieve("我最近总是心慌，还很焦虑", 2, cards);
    expect(out[0].id).toBe("panic");
    expect(out.every((c) => c.id !== "low")).toBe(true);
  });
  it("returns [] when nothing matches", () => {
    expect(keywordRetrieve("买菜做饭散步", 4, cards)).toEqual([]);
  });
  it("returns [] for empty card set or non-positive limit", () => {
    expect(keywordRetrieve("心慌", 4, [])).toEqual([]);
    expect(keywordRetrieve("心慌", 0, cards)).toEqual([]);
  });
});

describe("vectorRetrieve (injected provider + vectors, no network)", () => {
  const cards = [
    card({ id: "a", title: "A" }),
    card({ id: "b", title: "B" }),
    card({ id: "c", title: "C" })
  ];
  const vectors = { a: [1, 0], b: [0, 1], c: [0.9, 0.1] };

  it("cosine-orders cards and applies top-k", async () => {
    // query points at [1,0]: a (1.0) and c (~0.994) clear; b (0) does not.
    const out = await vectorRetrieve("q", 2, fakeProvider([1, 0]), cards, vectors, 0.3);
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("threshold filters out low-similarity cards", async () => {
    const out = await vectorRetrieve("q", 4, fakeProvider([1, 0]), cards, vectors, 0.95);
    // only a (1.0) and c (0.994) are >= 0.95; b (0) is excluded
    expect(out.map((x) => x.id).sort()).toEqual(["a", "c"]);
  });

  it("ignores cards that have no precomputed vector", async () => {
    const out = await vectorRetrieve("q", 4, fakeProvider([1, 0]), cards, { a: [1, 0] }, 0.3);
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("retrieveKnowledge integration (web-grounded KB populated)", () => {
  it("retrieves relevant, clinician-approved cards via the keyword path (provider unset)", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "");
    const out = await retrieveKnowledge("我一到考试就焦虑得不行");
    expect(out.length).toBeGreaterThan(0);
    // The clinical gate: only "approved" cards are ever surfaced.
    expect(out.every((c) => c.clinicalStatus === "approved")).toBe(true);
  });

  it("never throws even when the provider's embed rejects", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    // With zero cards this resolves via the keyword path before ever embedding,
    // but the call must still resolve (never reject) regardless.
    await expect(retrieveKnowledge("任何输入")).resolves.toBeInstanceOf(Array);
  });

  it("returns [] for empty / whitespace query without throwing", async () => {
    await expect(retrieveKnowledge("   ")).resolves.toEqual([]);
    await expect(retrieveKnowledge("anything", 0)).resolves.toEqual([]);
  });
});

describe("retrieveKnowledge Tier-1 (Qdrant dense, mocked)", () => {
  const groundedCard = card({
    id: "who-depression",
    title: "抑郁:临床事实与一线方法（WHO）",
    content: "抑郁是常见心理障碍。",
    guidance: ["先承接情绪"],
    keywords: ["抑郁"],
    tags: ["抑郁"],
    sourceTitle: "WHO 实况报道",
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/depression",
    sourceQuote: "try to keep doing activities you used to enjoy",
    clinicalStatus: "approved"
  });

  // Real CloudEmbeddingProvider (env-driven) whose embed() returns a fixed vector via a
  // stubbed fetch — no network, and getEmbeddingProvider() is NOT mocked (so the existing
  // provider-unset tests above keep their real behavior).
  function stubEmbedProvider() {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: [1, 0, 0] }] })
      }) as unknown as Response)
    );
  }

  it("fast mode: a Qdrant hit is returned WITH its source triple, and rerank is NOT called", async () => {
    stubEmbedProvider();
    mockedQdrant.mockResolvedValueOnce([groundedCard]);

    const out = await retrieveKnowledge("我怎么缓解抑郁", 4, { fastMode: true });

    expect(out.map((c) => c.id)).toEqual(["who-depression"]);
    expect(out[0].sourceUrl).toBe(groundedCard.sourceUrl);
    expect(out[0].sourceQuote).toBe(groundedCard.sourceQuote);
    expect(mockedRerank).not.toHaveBeenCalled();
  });

  it("Qdrant → null falls back to keyword retrieval (approved-only), never throws", async () => {
    stubEmbedProvider();
    mockedQdrant.mockResolvedValueOnce(null);

    const out = await retrieveKnowledge("我一到考试就焦虑得不行", 4, { fastMode: true });
    expect(Array.isArray(out)).toBe(true);
    expect(out.every((c) => c.clinicalStatus === "approved")).toBe(true);
  });

  it("embed AND Qdrant both throwing still resolves to an array (fail-safe [])", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("embed down");
      })
    );
    mockedQdrant.mockRejectedValueOnce(new Error("qdrant down"));

    await expect(retrieveKnowledge("任何输入", 4, { fastMode: true })).resolves.toBeInstanceOf(Array);
  });

  it("Qdrant UNCONFIGURED: Tier-1 is skipped WITHOUT any embed call (retrieval stays inert)", async () => {
    // The merge-safety property: with no QDRANT_* env, no embed API call fires and Qdrant
    // is never queried; fast mode falls straight to keyword.
    mockedQdrantConfigured.mockReturnValue(false);
    const fetchSpy = vi.fn(async () => {
      throw new Error("no network should be touched");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const out = await retrieveKnowledge("我一到考试就焦虑得不行", 4, { fastMode: true });

    expect(mockedQdrant).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled(); // no query embedding happened
    expect(Array.isArray(out)).toBe(true);
    expect(out.every((c) => c.clinicalStatus === "approved")).toBe(true);
  });

  it("fast mode: a slow Tier-1 times out and falls through to keyword (does NOT use the late Qdrant hit)", async () => {
    stubEmbedProvider();
    const lateCard = card({ id: "tier1-late-should-not-appear", title: "late", clinicalStatus: "approved" });
    // Qdrant resolves AFTER the fast wall-clock budget; withDeadline must abandon it.
    mockedQdrant.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve([lateCard]), 50))
    );

    const out = await retrieveKnowledge("我一到考试就焦虑得不行", 4, { fastMode: true, timeoutMs: 5 });

    expect(out.every((c) => c.id !== "tier1-late-should-not-appear")).toBe(true);
    expect(Array.isArray(out)).toBe(true);
  });
});
