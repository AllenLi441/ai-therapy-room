import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { generateSessionPlan } from "@/lib/case-formulation";
import { emptyCaseMap } from "@/lib/types";
import { defaultTurnPlan } from "@/lib/session-plan";
vi.mock("@/lib/case-formulation", () => ({ generateSessionPlan: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const request = (body: unknown) => new Request("http://localhost/api/plan", { method: "POST", body: JSON.stringify(body) });
describe("understanding endpoint", () => {
  it.each([null, { messages: {} }, { messages: [null] }])("rejects invalid message shapes", async (body) => { expect((await POST(request(body))).status).toBe(400); });
  it("requests a fresh result and exposes service failure for retry", async () => {
    vi.mocked(generateSessionPlan).mockRejectedValue(new Error("private-provider-detail"));
    const response = await POST(request({ language: "en", messages: [{ role: "user", content: "Synthetic work stress" }] }));
    expect(generateSessionPlan).toHaveBeenCalledWith(expect.objectContaining({ requireFresh: true, language: "en" }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "plan_unavailable", retryable: true });
  });
  it("returns valid understanding without a false error", async () => {
    vi.mocked(generateSessionPlan).mockResolvedValue({ caseMap: { ...emptyCaseMap(), presenting: "合成压力" }, turnPlan: defaultTurnPlan() });
    const response = await POST(request({ messages: [{ role: "user", content: "合成压力" }] }));
    expect(response.status).toBe(200); expect((await response.json()).plan.caseMap.presenting).toBe("合成压力");
  });
});
