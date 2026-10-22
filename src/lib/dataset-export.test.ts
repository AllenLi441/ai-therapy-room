import { describe, expect, it } from "vitest";
import { buildDpo, buildSafetyReview, buildSft, buildStats, isTrainableReply, maskOffline, normalizeDonation, piiSuspects, type DonationExportRow } from "./dataset-export";

// Synthetic rows only — real donations never enter the repository.
const model = { v: 1, app: "1.3.0", route: "deepseek_normal", pace: "deep", model: "deepseek-v4-pro", judge: { kind: "ok", severity: "none" } };
const reply = (content: string, extra: Record<string, unknown> = {}) => ({ role: "assistant", content, meta: model, safety: "safe", ...extra });
const ID = "6f1c2b8e-1d2a-4c3b-9a8d-7e6f5a4b3c2d";
const row = (messages: unknown[], extra: Partial<DonationExportRow> = {}): DonationExportRow => ({
  id: ID, created_at: "2026-10-20T00:00:00Z", consent_version: "2",
  age_bracket: "18+", language: "zh", support_region: "CN", app_version: "1.3.0", messages, ...extra,
});
const conv = (messages: unknown[], extra: Partial<DonationExportRow> = {}, cleared?: Set<string>) => normalizeDonation(row(messages, extra), cleared)!;

describe("offline masking", () => {
  it("masks names and addresses only in an unambiguous context", () => {
    expect(maskOffline("我姓王，住在阳光3号楼2单元501室，电话13812345678")).toBe("我姓[NAME]，住在[ADDRESS]，电话[PHONE]");
    expect(maskOffline("在5栋2单元")).toBe("在[ADDRESS]");
  });

  it.each([
    "爸妈一直叫我去死", "这叫我怎么办", "我也不知道15号出成绩以后怎么办", "数学第3单元又没考好", "难道5号就不能休息吗",
  ])("leaves everyday text alone: %s", (text) => {
    expect(maskOffline(text)).toBe(text);
  });

  it("flags named schools, hospitals and compounds for review", () => {
    expect(piiSuspects("我在实验中学读高中")).toEqual(["实验中学"]);
    expect(piiSuspects("我在北京协和医院复查")).toEqual(["北京协和医院"]);
    expect(piiSuspects("住在万家花园")).toEqual(["万家花园"]);
    expect(piiSuspects("我在杭州外国语学校读高二")).toEqual(["杭州外国语学校"]);
    expect(piiSuspects("我在人大附中")).toEqual(["人大附中"]);
    expect(piiSuspects("我在101中学")).toEqual(["101中学"]);
    expect(piiSuspects("我在北京四中")).toEqual(["北京四中"]);
  });

  it.each([
    "我想考大学", "明天去医院", "我们公司很忙", "其实我是高中生", "我初中被孤立", "她大学毕业了", "我和大学同学吵架", "这一中午都很烦",
  ])("does not flag everyday phrases: %s", (text) => {
    expect(piiSuspects(text)).toEqual([]);
  });
});

describe("dataset export", () => {
  it("normalizes rows, drops malformed messages, marks minors and hides the row id", () => {
    const conversation = conv([
      { role: "user", content: "最近睡不好", hadImages: "yes" }, { role: "system", content: "x" }, reply("嗯", { meta: { ...model, junk: 1 } }),
    ], { age_bracket: "14-17" });
    expect(conversation.minor).toBe(true);
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0]).not.toHaveProperty("hadImages");
    expect(conversation.messages[1].meta).toEqual(model);
    expect(conversation.anon_id).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(buildSft(conversation))).not.toContain(ID);
    expect(normalizeDonation(row([{ role: "assistant", content: "只有回复" }]))).toBeNull();
  });

  it("marks crisis conversations from the reply route, not only the safety event", () => {
    expect(conv([{ role: "user", content: "我想跳楼" }, { role: "assistant", content: "危机回复", meta: { ...model, route: "lexicon_crisis", model: undefined } }]).had_crisis).toBe(true);
    expect(conv([{ role: "user", content: "我好一点了" }, reply("嗯", { meta: { ...model, crisis: true } })]).had_crisis).toBe(true);
    expect(conv([{ role: "user", content: "今天还好" }, reply("嗯")]).had_crisis).toBe(false);
  });

  it("trains only on clean model replies to a text turn, as prompt/completion", () => {
    const conversation = conv([
      { role: "assistant", content: "你好，我是安屿。" },
      { role: "user", content: "最近睡不好" },
      reply("睡不好的时候，夜里会很难熬。", { feedback: "up" }),
      { role: "user", content: "舍曲林吃几片" },
      { role: "assistant", content: "固定的用药边界说明", meta: { ...model, route: "lexicon_medication", model: undefined } },
      { role: "user", content: "还是很烦" },
      reply("被拦截后附带的回复", { meta: { ...model, decision: { intercept: true, mode: "gentle_check", source: "llm" } } }),
      { role: "user", content: "嗯" }, reply("用户说没帮到的回复", { feedback: "down" }),
      { role: "user", content: "嗯嗯" }, reply("判官没跑完的回复", { safety: "unchecked", meta: { ...model, judge: { kind: "error" } } }),
      { role: "user", content: "还好" }, reply("判官看到风险后放行的回复", { meta: { ...model, judge: { kind: "ok", severity: "passive_death_wish" } } }),
      { role: "user", content: "后来呢" }, reply("危机会话里的回复", { meta: { ...model, crisis: true } }),
      { role: "user", content: "CBT 是什么" }, reply("带资料的回复", { meta: { ...model, refs: ["ref-cbt"] } }),
      { role: "user", content: "你看这张图", hadImages: true }, reply("图里的房间很乱"),
      { role: "user", content: "我是不是抑郁症" }, reply("固定的诊断边界说明", { meta: { ...model, guard: "diagnosis" } }),
    ]);
    const sft = buildSft(conversation);
    expect(sft.map((s) => s.completion[0].content)).toEqual(["睡不好的时候，夜里会很难熬。"]);
    // The greeting is dropped so the prompt starts with the user, as chat templates require.
    expect(sft[0].prompt).toEqual([{ role: "user", content: "最近睡不好" }]);
    expect(sft[0].completion).toEqual([{ role: "assistant", content: "睡不好的时候，夜里会很难熬。" }]);
  });

  it("merges same-role runs in the prompt", () => {
    const sft = buildSft(conv([{ role: "user", content: "第一句" }, { role: "user", content: "第二句" }, reply("回复")]));
    expect(sft[0].prompt).toEqual([{ role: "user", content: "第一句\n\n第二句" }]);
  });

  it("pairs the kept reply against each replaced one in TRL's conversational format", () => {
    const conversation = conv([
      { role: "user", content: "考试很焦虑" },
      reply("最后保留的回复", { alternatives: [{ content: "第一次的回复", meta: model, feedback: "down" }, { content: "用户其实喜欢的回复", meta: model, feedback: "up" }, { content: "被撤回后换上的固定说明", meta: { ...model, guard: "medication" } }] }),
    ]);
    expect(buildDpo(conversation)).toEqual([expect.objectContaining({
      prompt: [{ role: "user", content: "考试很焦虑" }],
      chosen: [{ role: "assistant", content: "最后保留的回复" }],
      rejected: [{ role: "assistant", content: "第一次的回复" }],
    })]);
  });

  it("builds no pair for a reply whose user message was deleted", () => {
    const conversation = conv([
      { role: "user", content: "第一句" }, reply("第一条回复"),
      reply("用户删掉了问题的回复", { alternatives: [{ content: "旧回复" }] }),
    ]);
    expect(buildDpo(conversation)).toEqual([]);
    expect(buildSft(conversation).map((s) => s.completion[0].content)).toEqual(["第一条回复"]);
  });

  it("keeps conversations with named places out of training until cleared", () => {
    const messages = [{ role: "user", content: "我在北京大学压力很大" }, reply("压力确实不小。", { alternatives: [{ content: "旧回复" }] })];
    const conversation = conv(messages);
    expect(conversation.pii_suspects).toEqual(["北京大学"]);
    expect(buildSft(conversation)).toEqual([]);
    expect(buildDpo(conversation)).toEqual([]);
    const cleared = conv(messages, {}, new Set([conversation.pii_review_key]));
    expect(cleared.pii_cleared).toBe(true);
    expect(buildSft(cleared)).toHaveLength(1);
    expect(buildDpo(cleared)).toHaveLength(1);
  });

  it("isTrainableReply needs a completed clean danger check", () => {
    const base = { role: "assistant" as const, content: "x", safety: "safe", meta: model as never };
    expect(isTrainableReply(base)).toBe(true);
    expect(isTrainableReply({ ...base, safety: "unchecked" })).toBe(false);
  });

  it("builds a blind review file with user turns only, places hidden, and a separate mapping", () => {
    const conversation = conv([
      { role: "user", content: "我在北京四中，今天还好" }, reply("嗯，听起来平静。"),
      { role: "user", content: "其实不想醒来" }, { role: "assistant", content: "温和询问", safety: "gentle", meta: { ...model, route: "implicit_gentle_check", model: undefined, judge: { kind: "ok", severity: "passive_death_wish" } } },
      { role: "user", content: "嗯" }, reply("判官超时", { safety: "unchecked", meta: { ...model, judge: { kind: "error" } } }),
    ]);
    const { blind, mapping } = buildSafetyReview([conversation]);
    const item = blind.find((b) => b.conversation.endsWith("其实不想醒来"))!;
    expect(item.conversation).toBe("第1轮: 我在[PLACE]，今天还好\n第2轮（请标本轮）: 其实不想醒来");
    expect(JSON.stringify(blind)).not.toMatch(/温和询问|implicit_gentle_check|北京四中/);
    expect(mapping.find((m) => m.blind_item_id === item.blind_item_id)).toMatchObject({ route: "implicit_gentle_check", message_index: 2, conversation_id: ID });
    expect(blind.some((b) => b.conversation.endsWith("（请标本轮）: 嗯"))).toBe(true);
    expect(buildStats([conversation], { sft: 0, dpo: 0, review: blind.length })).toMatchObject({
      conversations: 1, user_turns: 3, pii_waiting_review: 1, reply_routes: { deepseek_normal: 2, implicit_gentle_check: 1 },
    });
  });
});
