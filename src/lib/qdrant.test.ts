import { afterEach, describe, expect, it, vi } from "vitest";
import { qdrantDenseSearch } from "./qdrant";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubQdrantEnv() {
  vi.stubEnv("QDRANT_URL", "https://xyz.qdrant.io");
  vi.stubEnv("QDRANT_API_KEY", "qk-test");
  vi.stubEnv("QDRANT_COLLECTION", "jingshi");
}

type SearchRequest = {
  filter: { must: Array<{ key: string; match: { value: string } }> };
  limit: number;
  with_payload: boolean;
};
type RequestCapture = { body?: SearchRequest };

/** A minimal ok-fetch that records the parsed request body for assertions. */
function stubFetchOnce(points: unknown[], capture?: RequestCapture) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      if (capture) capture.body = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { points } })
      } as unknown as Response;
    })
  );
}

const whoPayload = {
  id: "who-depression",
  title: "抑郁:临床事实与一线方法（WHO）",
  content: "抑郁是常见心理障碍……",
  guidance: ["先承接情绪"],
  keywords: ["抑郁", "情绪低落"],
  tags: ["抑郁"],
  sourceTitle: "WHO — Depressive disorder 实况报道",
  sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/depression",
  sourceQuote: "try to keep doing activities you used to enjoy",
  lang: "zh",
  trustTier: "authoritative",
  sourceId: "who-depression",
  chunkPath: "抑郁:临床事实与一线方法（WHO）",
  clinicalStatus: "approved"
};

describe("qdrantDenseSearch — fail-safe contract", () => {
  it("returns null when env is missing (never throws)", async () => {
    // No QDRANT_* stubbed.
    await expect(qdrantDenseSearch([0.1, 0.2], { limit: 4 })).resolves.toBeNull();
  });

  it("returns null for an empty vector or non-positive limit", async () => {
    stubQdrantEnv();
    stubFetchOnce([whoPayload]);
    await expect(qdrantDenseSearch([], { limit: 4 })).resolves.toBeNull();
    await expect(qdrantDenseSearch([0.1], { limit: 0 })).resolves.toBeNull();
  });

  it("happy path: filter pins approved, and the source triple is preserved in the mapped card", async () => {
    stubQdrantEnv();
    const capture: RequestCapture = {};
    stubFetchOnce([{ id: 1, score: 0.9, payload: whoPayload }], capture);

    const out = await qdrantDenseSearch([0.1, 0.2, 0.3], { limit: 4 });
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);

    // approved-only is always in the filter.
    expect(capture.body?.filter.must).toContainEqual({
      key: "clinicalStatus",
      match: { value: "approved" }
    });
    expect(capture.body?.limit).toBe(4);
    expect(capture.body?.with_payload).toBe(true);

    // Verifiable source triple survives the round-trip (panel refs unchanged).
    const card = out![0];
    expect(card.id).toBe("who-depression");
    expect(card.sourceTitle).toBe(whoPayload.sourceTitle);
    expect(card.sourceUrl).toBe(whoPayload.sourceUrl);
    expect(card.sourceQuote).toBe(whoPayload.sourceQuote);
    expect(card.clinicalStatus).toBe("approved");
  });

  it("passes lang and trustTier into the filter when given", async () => {
    stubQdrantEnv();
    const capture: RequestCapture = {};
    stubFetchOnce([{ id: 1, payload: whoPayload }], capture);

    await qdrantDenseSearch([0.1], { limit: 3, lang: "zh", trustTier: "authoritative" });
    expect(capture.body?.filter.must).toContainEqual({ key: "lang", match: { value: "zh" } });
    expect(capture.body?.filter.must).toContainEqual({
      key: "trustTier",
      match: { value: "authoritative" }
    });
  });

  it("returns null on a non-ok response", async () => {
    stubQdrantEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response)
    );
    await expect(qdrantDenseSearch([0.1], { limit: 4 })).resolves.toBeNull();
  });

  it("returns null when fetch throws (timeout / network)", async () => {
    stubQdrantEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("aborted");
      })
    );
    await expect(qdrantDenseSearch([0.1], { limit: 4 })).resolves.toBeNull();
  });

  it("rejects pending clinical cards even if remote flags claim source verification", async () => {
    stubQdrantEnv();
    stubFetchOnce([{ score: 0.9, payload: { ...whoPayload, clinicalStatus: "pending", sourceReview: { status: "verified_primary" }, channel: "grounded_information" } }]);
    expect(await qdrantDenseSearch([0.1], { limit: 4 })).toEqual([]);
  });

  it("does not trust a spoofed domain, unsafe scheme, missing citation or empty content", async () => {
    stubQdrantEnv();
    stubFetchOnce([
      ...["https://who.int.evil.example/fact", "javascript:alert(1)", "https://who.int@evil.example", "http://www.who.int/fact", ""].map((sourceUrl) => ({ score: 0.9, payload: { ...whoPayload, sourceUrl } })),
      { score: 0.9, payload: { ...whoPayload, content: "" } },
    ]);
    expect(await qdrantDenseSearch([0.1], { limit: 4 })).toEqual([]);
  });

  it("enforces score floor locally and rejects NaN embeddings without a request", async () => {
    stubQdrantEnv();
    stubFetchOnce([
      { score: 0.2, payload: whoPayload },
      { payload: { ...whoPayload, id: "missing-score" } },
      { score: 0.8, payload: { ...whoPayload, id: "strong" } },
    ]);
    const result = await qdrantDenseSearch([0.1], { limit: 4, scoreThreshold: 0.45 });
    expect(result?.map((card) => card.id)).toEqual(["strong"]);
    vi.mocked(fetch).mockClear();
    expect(await qdrantDenseSearch([NaN], { limit: 4 })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
