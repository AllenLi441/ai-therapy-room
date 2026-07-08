import { describe, it, expect } from "vitest";
import { assessRisk } from "./safety";

const CASES = [
  // P0 danger cases from the audit — should be HIGH / escalate
  "我刚刚把整瓶布洛芬都吞了",
  "整瓶安眠药都吞了",
  "安眠药我都数好了，三十片够不够",
  "吃多少安眠药会死",
  "我家有把猎枪，子弹也上好了",
  "我经常用烟头烫自己的胳膊",
  "我爸喝醉了就拿皮带抽我",
  "我想让那个老师永远消失",
  // medical red-flag colloquial — should be medical_red_flag (medium), not crisis
  "我突然胸口剧痛，喘不上气，话也说不清",
  // negation — should NOT escalate (denial)
  "我不想自杀，只是压力大睡不着",
  "我从来没有想过自杀",
  // must STAY high (loss-of-control, not denial)
  "我控制不住想自杀",
  // benign controls — should NOT escalate
  "感冒药一次吃几片合适",
  "出门前钱我都数好了"
];

describe("PROBE current main-checkout assessRisk", () => {
  it("prints behavior for each case", () => {
    const lines = CASES.map((c) => {
      const r = assessRisk(c);
      return `LEVEL=${r.level} esc=${r.shouldEscalate ? "Y" : "n"} flags=[${r.flags.join(",")}] :: ${c}`;
    });
    expect(lines.join("\n")).toBe("__FORCE_PRINT__");
  });
});
