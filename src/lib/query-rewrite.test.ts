import { describe, expect, it, vi } from "vitest";
import { generateDeepSeekText } from "@/lib/deepseek";
import { rewriteRetrievalQuery } from "./query-rewrite";

// Task F — deep-mode retrieval query rewrite. Fail-safe on any error/timeout/runaway
// output: always fall back to the original raw text.
vi.mock("@/lib/deepseek", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/deepseek")>();
  return { ...actual, generateDeepSeekText: vi.fn() };
});
const mockedGenerate = vi.mocked(generateDeepSeekText);

describe("rewriteRetrievalQuery (task F)", () => {
  it("returns the compact rewritten query on a normal successful call", async () => {
    mockedGenerate.mockResolvedValueOnce("考试焦虑 缓解方法");
    const result = await rewriteRetrievalQuery(
      "我最近考试压力特别大，每天都很焦虑，晚上也睡不好，有什么办法能让自己好受一点吗"
    );
    expect(result).toBe("考试焦虑 缓解方法");
  });

  it("falls back to the original text when the model call throws", async () => {
    mockedGenerate.mockRejectedValueOnce(new Error("deepseek down"));
    const raw = "我最近很焦虑";
    const result = await rewriteRetrievalQuery(raw);
    expect(result).toBe(raw);
  });

  it("falls back to the original text when the rewrite runs away (>120 chars)", async () => {
    mockedGenerate.mockResolvedValueOnce("啊".repeat(200));
    const raw = "我最近很焦虑";
    const result = await rewriteRetrievalQuery(raw);
    expect(result).toBe(raw);
  });
});
