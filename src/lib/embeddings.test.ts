import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmbeddingProvider, type EmbeddingProvider } from "./embeddings";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getEmbeddingProvider selection", () => {
  it("returns null for cloud without an API key (→ keyword fallback)", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "");
    expect(getEmbeddingProvider()).toBeNull();
  });

  it("builds a cloud provider with an id encoding provider+model", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "sk-test");
    vi.stubEnv("EMBEDDING_MODEL", "text-embedding-3-large");
    const p = getEmbeddingProvider();
    expect(p).not.toBeNull();
    expect(p?.id).toBe("openai:text-embedding-3-large");
  });

  it("defaults the cloud model when EMBEDDING_MODEL is unset", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "sk-test");
    vi.stubEnv("EMBEDDING_MODEL", "");
    expect(getEmbeddingProvider()?.id).toBe("openai:text-embedding-3-small");
  });

  it("returns null for local without a base URL", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "local");
    vi.stubEnv("EMBEDDING_BASE_URL", "");
    expect(getEmbeddingProvider()).toBeNull();
  });

  it("builds a local provider with a local: id", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "local");
    vi.stubEnv("EMBEDDING_BASE_URL", "http://127.0.0.1:8900/embed");
    vi.stubEnv("EMBEDDING_MODEL", "bge-m3");
    expect(getEmbeddingProvider()?.id).toBe("local:bge-m3");
  });

  it("returns null for an unknown backend", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "banana");
    expect(getEmbeddingProvider()).toBeNull();
  });
});

describe("cloud provider embed() (fetch mocked — no network)", () => {
  it("posts to {base}/embeddings and returns the vectors in order", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "sk-test");
    vi.stubEnv("EMBEDDING_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("EMBEDDING_MODEL", "text-embedding-3-small");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0] }, { embedding: [0, 1] }] })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = getEmbeddingProvider() as EmbeddingProvider;
    const out = await provider.embed(["a", "b"]);

    expect(out).toEqual([
      [1, 0],
      [0, 1]
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/embeddings");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("embed([]) short-circuits without calling fetch", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "sk-test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = getEmbeddingProvider() as EmbeddingProvider;
    expect(await provider.embed([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-ok response (caller is expected to fall back)", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "cloud");
    vi.stubEnv("EMBEDDING_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }))
    );
    const provider = getEmbeddingProvider() as EmbeddingProvider;
    await expect(provider.embed(["x"])).rejects.toThrow();
  });
});

describe("local provider embed() (fetch mocked)", () => {
  it("posts { input } to the base URL and returns { embeddings }", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "local");
    vi.stubEnv("EMBEDDING_BASE_URL", "http://127.0.0.1:8900/embed");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [[0.5, 0.5]] })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = getEmbeddingProvider() as EmbeddingProvider;
    const out = await provider.embed(["hello"]);
    expect(out).toEqual([[0.5, 0.5]]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8900/embed");
    expect(JSON.parse(init.body as string)).toEqual({ input: ["hello"] });
  });
});
