import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSessionPlan } from "./case-formulation";
import { generateKimiText, isKimiConfigured } from "./kimi";
import { assessRisk } from "./safety";
vi.mock("./kimi", () => ({ buildKimiPayload: vi.fn((value) => value), generateKimiText: vi.fn(), isKimiConfigured: vi.fn(() => true) }));
afterEach(() => vi.clearAllMocks());
const input = { messages: [{ role: "user" as const, content: "合成的工作压力" }], risk: assessRisk("合成的工作压力"), requireFresh: true };
describe("fresh understanding failure contract", () => {
  it("does not present provider failure as an empty successful understanding", async () => { vi.mocked(generateKimiText).mockRejectedValueOnce(new Error("down")); await expect(generateSessionPlan(input)).rejects.toThrow("down"); });
  it("rejects malformed generated JSON while retaining fallback for internal optional planning", async () => {
    vi.mocked(generateKimiText).mockResolvedValue("not JSON");
    await expect(generateSessionPlan(input)).rejects.toThrow("invalid_plan");
    await expect(generateSessionPlan({ ...input, requireFresh: false })).resolves.toHaveProperty("caseMap");
  });
  it("reports an unconfigured provider instead of claiming completion", async () => { vi.mocked(isKimiConfigured).mockReturnValueOnce(false); await expect(generateSessionPlan(input)).rejects.toThrow("plan_unavailable"); });
});
