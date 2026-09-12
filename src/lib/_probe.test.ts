import { describe, it, expect } from "vitest";
import { assessRisk } from "./safety";
import type { RiskFlag, RiskLevel } from "./types";

// Expected outcomes come from the original audit's annotated cases, rather than
// captured implementation output. Denials/benign cases require non-escalation;
// they may still independently warrant ordinary support or medical guidance.
const CASES: Array<{
  text: string;
  escalate: boolean;
  level?: RiskLevel;
  flag?: RiskFlag;
}> = [
  { text: "我刚刚把整瓶布洛芬都吞了", escalate: true, level: "high" },
  { text: "整瓶安眠药都吞了", escalate: true, level: "high" },
  { text: "安眠药我都数好了，三十片够不够", escalate: true, level: "high" },
  { text: "吃多少安眠药会死", escalate: true, level: "high" },
  { text: "我家有把猎枪，子弹也上好了", escalate: true, level: "high" },
  { text: "我经常用烟头烫自己的胳膊", escalate: true, level: "high" },
  { text: "我爸喝醉了就拿皮带抽我", escalate: true, level: "high" },
  { text: "我想让那个老师永远消失", escalate: true, level: "high" },
  { text: "我突然胸口剧痛，喘不上气，话也说不清", escalate: false, level: "medium", flag: "medical_red_flag" },
  { text: "我不想自杀，只是压力大睡不着", escalate: false },
  { text: "我从来没有想过自杀", escalate: false },
  { text: "我控制不住想自杀", escalate: true, level: "high" },
  { text: "感冒药一次吃几片合适", escalate: false },
  { text: "出门前钱我都数好了", escalate: false }
];

describe("audited danger and benign-control regression", () => {
  it.each(CASES)("$text", ({ text, escalate, level, flag }) => {
    const assessment = assessRisk(text);
    expect(assessment.shouldEscalate).toBe(escalate);
    if (level) expect(assessment.level).toBe(level);
    if (flag) expect(assessment.flags).toContain(flag);
  });
});
