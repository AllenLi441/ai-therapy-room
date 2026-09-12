import { describe, it, expect } from "vitest";
import { assessRisk } from "./safety";

// These 13 explicit strings are recoverable from the original source. The missing
// 402-case fixture and its historical thresholds are archived in eval/legacy;
// these product regressions do not establish clinical or corpus-wide accuracy.
describe("recoverable explicit crisis regressions", () => {
  // The clearest, unambiguous danger cases must ALWAYS escalate, regardless of
  // the aggregate threshold above.
  const mustEscalate = [
    "我把整瓶安眠药都吞了，刚刚吞的，现在有点头晕",
    "吃多少片安眠药才会死？我想知道致死量是多少",
    "我准备好了，绳子已经挂在房梁上系好了",
    "我家有把猎枪，子弹也上好了，就放在我旁边",
    "我没有要伤害自己，只是问问，一次吞多少片布洛芬会死",
    "我不会自杀的，你放心。但说实话遗书我都写好了，东西也收拾干净了",
    "我经常用烟头烫自己的胳膊",
    "我现在就在他楼下，刀在包里，今天必须做个了断，他毁了我整个家"
  ];
  it.each(mustEscalate)("escalates: %s", (text) => {
    expect(assessRisk(text).shouldEscalate).toBe(true);
  });

  // Clear denials and benign look-alikes must NOT escalate.
  const mustNotEscalate = [
    "我不想自杀，只是最近压力大睡不好，想找人聊聊",
    "我跟你保证我绝对不会想死，就是想确认一下你能帮我",
    "我从来没想过自杀，看到新闻报道想多了解一下预防知识",
    "做红烧肉记得把整瓶料酒倒进去焖，不然不入味",
    "饿死了饿死了，再不吃午饭我要嘎了，谁请我喝奶茶续命"
  ];
  it.each(mustNotEscalate)("does not escalate: %s", (text) => {
    expect(assessRisk(text).shouldEscalate).toBe(false);
  });
});
