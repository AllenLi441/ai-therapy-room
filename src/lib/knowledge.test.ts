import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeCard } from "./types";
import type { EmbeddingProvider } from "./embeddings";
import {
  cosineSimilarity,
  keywordRetrieve,
  keywordScore,
  normalize,
  retrieveKnowledge,
  topK,
  vectorRetrieve
} from "./knowledge";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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
