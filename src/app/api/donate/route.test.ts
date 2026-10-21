import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";
import { DONATION_CONSENT_VERSION } from "@/lib/donations";

const post = (body: unknown) => POST(new Request("http://localhost/api/donate", { method: "POST", body: JSON.stringify(body) }));
const del = (body: unknown) => DELETE(new Request("http://localhost/api/donate", { method: "DELETE", body: JSON.stringify(body) }));
const valid = {
  messages: [
    { role: "user", content: "我叫李小明，最近考试压力很大，电话13812345678", pace: "fast" },
    { role: "assistant", content: "听起来这段时间压力挺大的。", safety: "safe", feedback: "up" },
  ],
  ageBracket: "14-17", language: "zh", supportRegion: "CN", consentVersion: DONATION_CONSENT_VERSION,
};

let supabase: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co/");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_synthetic");
  vi.stubEnv("DONATE_RATE_LIMIT_MAX", "1000");
  supabase = vi.fn(async () => new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", supabase);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("donation endpoint", () => {
  it("stores a masked conversation with only the secret key header and returns a withdrawal id", async () => {
    const response = await post(valid);
    expect(response.status).toBe(200);
    const { id } = await response.json();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const [url, init] = supabase.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/donations?on_conflict=id");
    expect(init.headers).toMatchObject({ apikey: "sb_secret_synthetic", Prefer: "resolution=merge-duplicates,return=minimal" });
    expect(init.headers).not.toHaveProperty("Authorization");
    const row = JSON.parse(String(init.body));
    expect(row).toMatchObject({ id, age_bracket: "14-17", language: "zh", support_region: "CN", consent_version: DONATION_CONSENT_VERSION });
    expect(row.messages[0]).toEqual({ role: "user", content: "我叫[NAME]，最近考试压力很大，电话[PHONE]", pace: "fast" });
    expect(row.messages[1]).toEqual({ role: "assistant", content: "听起来这段时间压力挺大的。", safety: "safe", feedback: "up" });
  });

  it("sends a legacy service_role JWT on both headers", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "eyJsynthetic.jwt");
    await post(valid);
    expect((supabase.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({ apikey: "eyJsynthetic.jwt", Authorization: "Bearer eyJsynthetic.jwt" });
  });

  it("updates the same row as a conversation grows, crisis turns included", async () => {
    const id = "6f1c2b8e-1d2a-4c3b-9a8d-7e6f5a4b3c2d";
    const grown = { ...valid, id, messages: [...valid.messages, { role: "user", content: "后来又想到一些事" }, { role: "assistant", content: "安全提示", safety: "crisis" }] };
    const response = await post(grown);
    expect(await response.json()).toEqual({ id });
    const row = JSON.parse(String((supabase.mock.calls[0] as [string, RequestInit])[1].body));
    expect(row.id).toBe(id);
    expect(row.messages).toHaveLength(4);
    expect(row.messages[3]).toMatchObject({ safety: "crisis" });
  });

  it.each([
    ["under 14", { ...valid, ageBracket: "under-14" }],
    ["no consent", { ...valid, consentVersion: undefined }],
    ["an old consent version", { ...valid, consentVersion: "1" }],
    ["the consent before reply labels were shared", { ...valid, consentVersion: "2" }],
    ["no user message", { ...valid, messages: [valid.messages[1]] }],
    ["a malformed conversation id", { ...valid, id: "not-a-uuid" }],
    ["an unknown language", { ...valid, language: "xx" }],
  ])("rejects %s without contacting storage", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(supabase).not.toHaveBeenCalled();
  });

  it("reports when storage is not configured, and when it fails", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect((await post(valid)).status).toBe(503);
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_synthetic");
    supabase.mockResolvedValueOnce(new Response("denied", { status: 401 }));
    expect((await post(valid)).status).toBe(502);
  });

  it("withdraws by id", async () => {
    const id = "6f1c2b8e-1d2a-4c3b-9a8d-7e6f5a4b3c2d";
    expect((await del({ id })).status).toBe(200);
    expect(supabase).toHaveBeenCalledWith(`https://example.supabase.co/rest/v1/donations?id=eq.${id}`, expect.objectContaining({ method: "DELETE" }));
    expect((await del({ id: "not-a-uuid" })).status).toBe(400);
  });

  it("keeps the reply trace, timestamps and replaced replies, masked and whitelisted", async () => {
    const meta = { v: 1, app: "1.3.0", route: "deepseek_normal", pace: "deep", model: "deepseek-v4-pro", judge: { kind: "ok", severity: "none", rationale: "原话" } };
    await post({ ...valid, messages: [
      { ...valid.messages[0], ts: 1760000000000 },
      { ...valid.messages[1], ts: 1760000005000, meta, alternatives: [{ content: "换之前的回复，电话13812345678", meta, feedback: "down", extra: true }] },
      { role: "user", content: "嗯", meta },
    ] });
    const row = JSON.parse(String((supabase.mock.calls[0] as [string, RequestInit])[1].body));
    expect(row).toMatchObject({ schema_version: 2, turn_count: 2, had_crisis: false, updated_at: expect.any(String) });
    expect(row.messages[0].ts).toBe(1760000000000);
    const parsedMeta = { v: 1, app: "1.3.0", route: "deepseek_normal", pace: "deep", model: "deepseek-v4-pro", judge: { kind: "ok", severity: "none" } };
    expect(row.messages[1].meta).toEqual(parsedMeta);
    expect(row.messages[1].alternatives).toEqual([{ content: "换之前的回复，电话[PHONE]", meta: parsedMeta, feedback: "down" }]);
    expect(row.messages[2]).toEqual({ role: "user", content: "嗯" });
  });

  it("counts a crisis reply that carries no safety event, and keeps the image flag on user turns only", async () => {
    const crisisMeta = { v: 1, app: "1.3.0", route: "lexicon_crisis", pace: "deep" };
    await post({ ...valid, messages: [
      { role: "user", content: "我想跳楼", hadImages: true }, { role: "assistant", content: "危机回复", meta: crisisMeta, hadImages: true },
    ] });
    const row = JSON.parse(String((supabase.mock.calls[0] as [string, RequestInit])[1].body));
    expect(row.had_crisis).toBe(true);
    expect(row.messages[0].hadImages).toBe(true);
    expect(row.messages[1]).not.toHaveProperty("hadImages");
  });

  it("falls back to the old row shape until the v2 migration has run", async () => {
    supabase.mockResolvedValueOnce(new Response('{"code":"PGRST204","message":"Could not find the \'had_crisis\' column"}', { status: 400 }));
    expect((await post(valid)).status).toBe(200);
    expect(supabase).toHaveBeenCalledTimes(2);
    const retried = JSON.parse(String((supabase.mock.calls[1] as [string, RequestInit])[1].body));
    expect(retried).not.toHaveProperty("schema_version");
    expect(retried).not.toHaveProperty("had_crisis");
    expect(retried.messages).toHaveLength(2);
  });
});
