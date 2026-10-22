import { describe, expect, it } from "vitest";
import { findGuardHit, guardReplacement, guardReplyStream } from "./output-guard";
import { createDiagnosisBoundaryResponse, createMedicationBoundaryResponse } from "./safety";
import { EVENT_DELIM, REASONING_CLOSE, REASONING_OPEN } from "./stream-markers";

const source = (parts: string[]) => {
  let i = 0;
  return new ReadableStream<Uint8Array>({ pull(c) { if (i < parts.length) c.enqueue(new TextEncoder().encode(parts[i++])); else c.close(); } });
};
const read = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader(); const dec = new TextDecoder(); let out = "";
  for (;;) { const { value, done } = await reader.read(); if (done) return out + dec.decode(); out += dec.decode(value, { stream: true }); }
};

describe("output guard rules", () => {
  it.each([
    ["means", "一般来说致死量大概是这个数"],
    ["means", "吃 30 片就会没命"],
    ["means", "割腕的方法其实很多"],
    ["medication", "舍曲林一般从 50mg 开始"],
    ["medication", "你可以自己减量试试看"],
    ["medication", "Sertraline usually starts at 50 mg."],
    ["diagnosis", "你这就是抑郁症，不用怀疑。"],
    ["diagnosis", "听起来你得了焦虑症。"],
    ["diagnosis", "You clearly have depression."],
  ])("flags %s: %s", (kind, text) => {
    expect(findGuardHit(text)).toBe(kind);
  });

  it.each([
    "这不代表你得了抑郁症，持续的低落值得找专业的人聊聊。",
    "我没法判断你是不是抑郁症，这需要医生面对面评估。",
    "如果你有焦虑症的诊断，按医生的方案来就好。",
    "你有焦虑症的诊断吗？",
    "关于舍曲林的剂量，需要问开药的医生，不要自己停药。",
    "睡前半小时放下手机，试试慢慢呼气。",
    "听起来你今天真的很累，先照顾好自己。",
    "You may want to talk to a doctor about whether this could be depression.",
  ])("leaves a careful reply alone: %s", (text) => {
    expect(findGuardHit(text)).toBeNull();
  });

  it("checks romantic role-play only for minors", () => {
    expect(findGuardHit("好呀，我来做你的男朋友")).toBeNull();
    expect(findGuardHit("好呀，我来做你的男朋友", { minor: true })).toBe("romance");
    expect(guardReplacement("romance", "zh")).toContain("不能扮演男女朋友");
    expect(guardReplacement("medication", "zh")).toBe(createMedicationBoundaryResponse("zh"));
  });
});

describe("guarded reply stream", () => {
  it("passes a normal reply through unchanged, in order, with thinking markers", async () => {
    const parts = [REASONING_OPEN, REASONING_CLOSE, "听起来今天", "真的很累。先", "照顾好自己，", "我们慢慢说。"];
    expect(await read(guardReplyStream(source(parts), { language: "zh" }))).toBe(parts.join(""));
  });

  it("withdraws a reply that turns into a diagnosis, even across chunks", async () => {
    const out = await read(guardReplyStream(source(["从你说的这些来看，", "你这就是抑", "郁症。还有很多后续"]), { language: "zh" }));
    const [shown, event] = out.split(EVENT_DELIM);
    expect(shown).not.toContain("抑郁症");
    expect(JSON.parse(event)).toEqual({ type: "retract", kind: "diagnosis", text: createDiagnosisBoundaryResponse("zh") });
    expect(out).not.toContain("还有很多后续");
  });

  it("raises the crisis banner when a reply gives method detail", async () => {
    const out = await read(guardReplyStream(source(["其实割腕的方法"]), { language: "zh" }));
    expect(out).toContain('"type":"retract","kind":"means"');
    expect(out).toContain('"type":"safety","status":"suicide_concern"');
  });
});
