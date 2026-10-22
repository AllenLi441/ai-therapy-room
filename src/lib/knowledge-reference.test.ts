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

describe("teen knowledge cards (2026-10-05)", () => {
  const TEEN_IDS = KNOWLEDGE_REFERENCE_CARDS.filter((card) => card.id.startsWith("ref-teen-")).map((card) => card.id);

  it("all teen cards pass the local source-verified registry check", () => {
    expect(TEEN_IDS).toHaveLength(9);
    for (const card of KNOWLEDGE_REFERENCE_CARDS.filter((c) => c.id.startsWith("ref-teen-"))) {
      expect(isLocalSourceVerifiedCard(card), card.id).toBe(true);
    }
  });

  it.each([
    ["考试压力好大，有什么复习方法吗？", "ref-teen-exam-stress"],
    ["中考还有一个月，考前焦虑怎么办？", "ref-teen-exam-stress"],
    ["被同学孤立了，校园霸凌该怎么办？", "ref-teen-bullying"],
    ["在网上被网暴了怎么办？", "ref-teen-bullying"],
    ["我是不是抑郁了？一直很难过，对什么都没兴趣", "ref-teen-depression-signs"],
    ["控制不住想伤害自己怎么办？", "ref-teen-self-harm-help"],
    ["中学生睡多久才够？", "ref-teen-sleep"],
    ["每天熬夜写作业，早上起不来怎么办？", "ref-teen-sleep"],
    ["我在节食，吃完就想吐，正常吗？", "ref-teen-eating"],
    ["爸妈说我游戏上瘾，我真的沉迷游戏吗？", "ref-teen-gaming"],
    ["奶奶去世了我却没有哭，正常吗？", "ref-teen-grief"],
    ["青春期情绪起伏大，青少年心理问题常见吗？", "ref-teen-mental-health-common"],
    ["中学生每天睡多久才够？", "ref-teen-sleep"],
    ["青少年一天要睡几个小时？", "ref-teen-sleep"],
    ["外婆走了，我好难过，怎么办？", "ref-teen-grief"],
    ["被欺负了怎么办？", "ref-teen-bullying"],
    ["我是不是网瘾少年？", "ref-teen-gaming"],
  ])("teen question %s retrieves %s through the route's query builder", async (query, expected) => {
    // Same path as the chat route: topic-only query first, then local retrieval.
    const { query: topicQuery } = buildKnowledgeQuery([{ role: "user", content: query }]);
    expect(topicQuery).not.toBe("");
    const ids = (await retrieveKnowledge(topicQuery, 4)).map((card) => card.id);
    expect(ids).toContain(expected);
  });

  it.each(["工作压力大，晚上失眠怎么办？", "我最近总是焦虑，有什么方法缓解？", "CBT 是什么？"])(
    "adult question %s does not lead with a teen card",
    async (query) => {
      const { query: topicQuery } = buildKnowledgeQuery([{ role: "user", content: query }]);
      const ids = topicQuery ? (await retrieveKnowledge(topicQuery, 4)).map((card) => card.id) : [];
      expect(ids[0]?.startsWith("ref-teen-") ?? false).toBe(false);
    }
  );
});

describe("self-help method cards (2026-10-21)", () => {
  const METHOD_IDS = [
    "ref-panic-in-moment", "ref-performance-nerves", "ref-sleep-get-up", "ref-sleep-fixed-wake",
    "ref-assertive-request", "ref-assertive-no", "ref-feelings-naming", "ref-feelings-label-mindful", "ref-worry-time",
  ];

  it("all method cards pass the local source-verified registry check", () => {
    for (const id of METHOD_IDS) {
      const card = KNOWLEDGE_REFERENCE_CARDS.find((c) => c.id === id);
      expect(card && isLocalSourceVerifiedCard(card), id).toBe(true);
    }
  });

  it.each([
    ["怎么应对汇报前的焦虑", "ref-performance-nerves"],
    ["上台发言前手抖，有什么方法？", "ref-performance-nerves"],
    ["面试前很紧张，怎么缓解？", "ref-performance-nerves"],
    ["惊恐的时候怎么让自己平静？", "ref-panic-in-moment"],
    ["惊恐发作时该怎么办？", "ref-panic-in-moment"],
    ["What should I do during a panic attack?", "ref-panic-in-moment"],
    ["焦虑上来的时候怎么让自己平静下来？", "ref-breathing-comfort"],
    ["躺了半个小时还睡不着怎么办", "ref-sleep-get-up"],
    ["睡不着要不要起来？", "ref-sleep-get-up"],
    ["失眠的第二天要不要补觉？", "ref-sleep-fixed-wake"],
    ["每天几点起床比较好？作息怎么调", "ref-sleep-fixed-wake"],
    ["老是担心，有什么方法控制担忧？", "ref-worry-time"],
    ["室友太吵了，该怎么跟他说？", "ref-assertive-request"],
    ["对象总是迟到，我想表达不满又不想吵架，该怎么说？", "ref-assertive-request"],
    ["怎么拒绝同事又不伤关系？", "ref-assertive-no"],
    ["怎么跟父母设立边界？", "ref-assertive-no"],
    ["我说不清自己是什么情绪，怎么办？", "ref-feelings-naming"],
    ["How can I name my feelings?", "ref-feelings-naming"],
  ])("method request %s retrieves %s through the route's query builder", async (query, expected) => {
    const { query: topicQuery } = buildKnowledgeQuery([{ role: "user", content: query }]);
    expect(topicQuery).not.toBe("");
    const ids = (await retrieveKnowledge(topicQuery, 4)).map((card) => card.id);
    expect(ids).toContain(expected);
  });

  it.each([
    ["惊恐发作和惊恐障碍有什么区别？", "ref-panic-concepts"],
    ["社交焦虑是什么？", "ref-social-fear"],
    ["担忧时间是什么？", "ref-worry-time"],
  ])("concept question %s still leads with %s", async (query, expected) => {
    const { query: topicQuery } = buildKnowledgeQuery([{ role: "user", content: query }]);
    const ids = (await retrieveKnowledge(topicQuery, 4)).map((card) => card.id);
    expect(ids[0]).toBe(expected);
  });

  it.each([
    ["恋爱中经常吵架怎么办？", "ref-assertive-no"],
    ["情绪低落怎么办？", "ref-feelings-naming"],
  ])("broad question %s does not pull in %s", async (query, unexpected) => {
    const { query: topicQuery } = buildKnowledgeQuery([{ role: "user", content: query }]);
    const ids = topicQuery ? (await retrieveKnowledge(topicQuery, 4)).map((card) => card.id) : [];
    expect(ids).not.toContain(unexpected);
  });
});
