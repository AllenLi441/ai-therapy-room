import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { generateDeepSeekText } from "@/lib/deepseek";
vi.mock("@/lib/deepseek", () => ({ buildDeepSeekPayload: vi.fn((value) => value), generateDeepSeekText: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const request = (body: unknown) => new Request("http://localhost/api/summary", { method: "POST", body: JSON.stringify(body) });
describe("summary endpoint", () => {
  it.each([null, { messages: {} }, { messages: [null] }])("rejects invalid request shapes", async (body) => { expect((await POST(request(body))).status).toBe(400); });
  it("returns an explicit retryable error when generation fails", async () => {
    vi.mocked(generateDeepSeekText).mockRejectedValue(new Error("private-provider-detail"));
    const response = await POST(request({ messages: [{ role: "user", content: "合成对话" }] }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "summary_unavailable", retryable: true });
  });
  it("does not label empty provider output as a completed note", async () => {
    vi.mocked(generateDeepSeekText).mockResolvedValue("   ");
    expect((await POST(request({ messages: [{ role: "user", content: "合成对话" }] }))).status).toBe(503);
  });
  it("returns the generated note on success", async () => {
    vi.mocked(generateDeepSeekText).mockResolvedValue("今天说到了合成的工作压力。");
    const response = await POST(request({ messages: [{ role: "user", content: "合成对话" }] }));
    expect(await response.json()).toEqual({ summary: "今天说到了合成的工作压力。" });
  });
});
