import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KNOWLEDGE_REFERENCE_CARDS } from "./knowledge-reference-cards";
import { currentCardVectors, isLocalSourceVerifiedCard, retrieveKnowledge, cardEmbedText } from "./knowledge";
import { buildCounselorSystemPrompt } from "./prompts";
import { defaultTurnPlan } from "./case-formulation";
import { assessRisk } from "./safety";
import { buildKnowledgeQuery } from "./knowledge-query";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("source-verified local general-information registry", () => {
  it("retrieves both definition and help timing for a compound question without a provider", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network allowed"); }));
    const { query } = buildKnowledgeQuery([{ role: "user", content: "CBT 是什么？适合在什么情况下找专业人士了解？" }]);
    const result = await retrieveKnowledge(query, 4, { fastMode: true });
    expect(result.map((card) => card.id)).toEqual(expect.arrayContaining(["ref-cbt-connections", "ref-help-impact"]));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("serves verified local information offline without fabricating clinical approval", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("No network allowed"); });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await retrieveKnowledge("担忧时间 worry time", 4, { fastMode: true });
    expect(result.some((card) => card.id === "ref-worry-time")).toBe(true);
    expect(result.every(isLocalSourceVerifiedCard)).toBe(true);
    expect(result.every((card) => card.clinicalStatus === "pending")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts registry identity, never a copied pending payload claiming the same metadata", () => {
    const registered = KNOWLEDGE_REFERENCE_CARDS[0];
    expect(isLocalSourceVerifiedCard(registered)).toBe(true);
    expect(isLocalSourceVerifiedCard({ ...registered })).toBe(false);
    expect(isLocalSourceVerifiedCard({ ...registered, id: "remote-pending" })).toBe(false);
  });

  it("keeps source review and absent professional review explicit in the generation context", () => {
    const prompt = buildCounselorSystemPrompt({ risk: assessRisk("自我照顾是什么"), knowledge: [KNOWLEDGE_REFERENCE_CARDS[0]], turnPlan: defaultTurnPlan() });
    expect(prompt).toContain("尚未由心理专业人员审核");
    expect(prompt).toContain("不可当成个体治疗建议");
    expect(prompt).toContain(KNOWLEDGE_REFERENCE_CARDS[0].sourceTitle);
  });

  it("requires a matching embed-text fingerprint, rejecting old and edited embeddings", () => {
    const card = KNOWLEDGE_REFERENCE_CARDS[0];
    const base = { providerId: "test", model: "test", dim: 2, vectors: { [card.id]: [1, 0] } };
    expect(currentCardVectors([card], base)).toEqual({});
    const versioned = { ...base, contentHashes: { [card.id]: createHash("sha256").update(cardEmbedText(card)).digest("hex") } };
    expect(currentCardVectors([card], versioned)).toEqual(base.vectors);
    expect(currentCardVectors([{ ...card, content: "A different claim" }], versioned)).toEqual({});
  });
});
