import { describe, expect, it } from "vitest";
import { buildKnowledgeQuery } from "./knowledge-query";

const user = (content: string) => ({ role: "user" as const, content });
const assistant = (content: string) => ({ role: "assistant" as const, content });

// Frozen, authored regression inputs: no customer conversations or model calls.
// Tests measure query intent/context/privacy, not clinical quality or response safety.
describe("topic-only retrieval queries", () => {
  it.each([
    ["最近总是睡不着", "那怎么办？", "睡眠"],
    ["在说社交焦虑", "这有依据吗？", "社交焦虑"],
    ["想聊职业倦怠", "具体说说", "职业倦怠"],
    ["I struggle with sleep", "What can help?", "睡眠"],
    ["Tell me about grief", "Tell me more", "哀伤"],
    ["正念冥想", "它有用吗？", "正念"],
    ["最近入睡困难，白天也很累", "先从哪一件小事做起？", "睡眠"],
    ["我想了解担忧树", "讲细一点可以吗？", "担忧树"],
  ])("resolves a short follow-up using only previous user topic: %s → %s", (previous, current, topic) => {
    const result = buildKnowledgeQuery([user(previous), assistant("我们可以慢慢说"), user(current)]);
    expect(result.infoSeeking).toBe(true);
    expect(result.contextUsed).toBe(true);
    expect(result.query).toContain(topic);
  });

  it.each([
    ["失眠怎么办", "睡眠"], ["社交焦虑是什么？", "社交焦虑"],
    ["What is CBT?", "CBT"], ["How does mindfulness work?", "正念"],
    ["哀伤是什么？", "哀伤"], ["怎么做呼吸练习？", "呼吸"],
  ])("handles explicit topic %s", (question, topic) => {
    expect(buildKnowledgeQuery([user(question)]).query).toContain(topic);
  });

  it.each([
    "今天睡不着，好烦啊", "我只想说说，不要给建议", "焦虑怎么办？算了，只想倾诉",
    "失眠，我不想要建议", "I'm stressed, just listen", "比特币怎么买？", "披萨怎么做？",
    "压力压得我想哭，今天能不能别教方法，只听我说？",
    "今天天气怎么样？", "", "这有用吗？",
  ])("does not invent retrieval evidence on venting, unknown or unanchored turns: %s", (question) => {
    expect(buildKnowledgeQuery([user(question)]).query).toBe("");
  });

  it("a topic switch overrides old problems and assistant guesses", () => {
    const query = buildKnowledgeQuery([
      user("我之前失眠，住在海淀区甲路 28 号"),
      assistant("我推测你患有抑郁症"),
      user("现在想了解职业倦怠是什么？"),
    ]).query;
    expect(query).toContain("职业倦怠");
    expect(query).not.toMatch(/失眠|抑郁|海淀|28/);
  });

  it("preserves first-consultation preparation as a specific information intent", () => {
    const query = buildKnowledgeQuery([user("约了第一次心理咨询，该怎么准备想说的事情？")]).query;
    expect(query).toContain("就诊准备");
  });

  it("keeps both definition and help-seeking facets for a compound factual question", () => {
    const result = buildKnowledgeQuery([user("CBT 是什么？适合在什么情况下找专业人士了解？")]);
    expect(result.responseMode).toBe("information");
    expect(result.query).toContain("CBT");
    expect(result.query).toContain("什么时候求助 日常功能");
  });

  it.each([
    "CBT 的准确治愈率是多少？请给出一个百分比。",
    "CBT 是否有效", "正念的疗效怎么样", "心理咨询有副作用吗？",
    "CBT 的风险几率有多大？", "睡眠干预的成功率是多少", "给出 CBT 的准确百分比",
    "How effective is CBT?", "Does CBT have side effects?", "Give a cure rate percentage for CBT",
  ])("quantitative and efficacy questions use information mode: %s", (content) => {
    const query = buildKnowledgeQuery([user(content)]);
    expect(query.infoSeeking).toBe(true);
    expect(query.responseMode).toBe("information");
  });

  it("preserves a quantitative facet without forwarding the requested number as evidence", () => {
    const query = buildKnowledgeQuery([user("CBT 的准确治愈率是多少？请给出一个百分比。")]).query;
    expect(query).toContain("CBT");
    expect(query).toContain("疗效统计 风险概率 百分比");
  });

  it("mentioning percentages while declining advice remains support", () => {
    expect(buildKnowledgeQuery([user("别人只在乎成绩和百分比，我现在不想要方法，只听我说。")]).responseMode).toBe("support");
  });

  it.each(["焦虑让我觉得没人理解，你能懂吗？", "能不能先别教方法，只听我说？"])("a bid for emotional connection keeps support mode: %s", (content) => {
    expect(buildKnowledgeQuery([user(content)]).responseMode).toBe("support");
  });

  it("a clear unknown concept asks for information without inventing a search topic", () => {
    const result = buildKnowledgeQuery([user("异相整合疗法是什么？")]);
    expect(result.responseMode).toBe("information");
    expect(result.query).toBe("");
  });

  it("never forwards narrative identifiers even from the current question", () => {
    const query = buildKnowledgeQuery([
      user("我叫王小明，邮箱 wang@example.com，电话 13800138000，身份证 110101199001011234。焦虑怎么办？"),
    ]).query;
    expect(query).toContain("焦虑");
    expect(query).not.toMatch(/王小明|wang|13800138000|110101|example/);
    expect(query.length).toBeLessThanOrEqual(240);
  });

  it("does not resurrect an older topic across an unrelated intervening turn", () => {
    expect(buildKnowledgeQuery([user("失眠"), user("换个话题，今天的午饭"), user("这有用吗？")]).query).toBe("");
  });
});
