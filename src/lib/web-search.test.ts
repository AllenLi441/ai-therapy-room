import { describe, it, expect, vi, afterEach } from "vitest";
import { searchAuthoritative, AUTHORITATIVE_DOMAINS } from "./web-search";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("searchAuthoritative", () => {
  it("returns [] with no SEARCH_API_KEY (KB-only no-op)", async () => {
    vi.stubEnv("SEARCH_API_KEY", "");
    expect(await searchAuthoritative("失眠怎么办")).toEqual([]);
  });

  it("returns [] for an empty query", async () => {
    vi.stubEnv("SEARCH_API_KEY", "tvly-x");
    expect(await searchAuthoritative("   ")).toEqual([]);
  });

  it("maps results and RESTRICTS the search to the authoritative domain allowlist", async () => {
    vi.stubEnv("SEARCH_API_KEY", "tvly-x");
    let sentBody: { include_domains?: string[] } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: { body: string }) => {
        sentBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            results: [
              { title: "Insomnia - NHS", url: "https://www.nhs.uk/conditions/insomnia/", content: "  Most people  experience problems with sleep…  " },
              { title: "no url here" }
            ]
          })
        };
      })
    );
    const out = await searchAuthoritative("怎么改善失眠", 3);
    expect(out).toHaveLength(1); // the result without a url is dropped
    expect(out[0]).toMatchObject({ title: "Insomnia - NHS", url: "https://www.nhs.uk/conditions/insomnia/" });
    expect(out[0].snippet).toBe("Most people experience problems with sleep…"); // whitespace collapsed + trimmed
    expect(sentBody.include_domains).toEqual(AUTHORITATIVE_DOMAINS); // safety: domain-restricted
  });

  it("returns [] on a non-ok provider response", async () => {
    vi.stubEnv("SEARCH_API_KEY", "tvly-x");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await searchAuthoritative("x")).toEqual([]);
  });

  it("never throws — a fetch error yields []", async () => {
    vi.stubEnv("SEARCH_API_KEY", "tvly-x");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    expect(await searchAuthoritative("x")).toEqual([]);
  });
});
