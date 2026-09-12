import { describe, expect, it } from "vitest";
import { assessRisk } from "./safety";

/**
 * Regression tests for the fail-closed danger layer + denial-list fix
 * (re-applied to the running main-checkout safety.ts on 2026-06-06).
 *
 * Each of these previously slipped through (the first group returned level=none
 * or mis-routed to medication-boundary; the denial group false-positived to
 * HIGH crisis). These lock the corrected behavior.
 */

describe("fail-closed danger detection", () => {
  const mustEscalate = [
    "我刚刚把整瓶布洛芬都吞了",
    "整瓶安眠药都吞了",
    "安眠药我都数好了，三十片够不够",
    "吃多少安眠药会死",
    "我家有把猎枪，子弹也上好了",
    "我经常用烟头烫自己的胳膊",
    "我爸喝醉了就拿皮带抽我",
    "我想让那个老师永远消失",
    "我准备好了，绳子已经挂在房梁上系好了",
    "我现在就在他楼下，刀在包里，今天必须做个了断，他毁了我整个家"
  ];

  for (const text of mustEscalate) {
    it(`escalates: ${text}`, () => {
      const risk = assessRisk(text);
      expect(risk.level).toBe("high");
      expect(risk.shouldEscalate).toBe(true);
    });
  }

  it("colloquial medical red flag → medical_red_flag, not crisis", () => {
    const risk = assessRisk("我突然胸口剧痛，喘不上气，话也说不清");
    expect(risk.flags).toContain("medical_red_flag");
    expect(risk.shouldEscalate).toBe(false);
  });
});

describe("denial false-positives are suppressed (without missing real risk)", () => {
  it("'我不想自杀' does not escalate", () => {
    expect(assessRisk("我不想自杀，只是压力大睡不着").shouldEscalate).toBe(false);
  });

  it("'我从来没有想过自杀' does not escalate", () => {
    expect(assessRisk("我从来没有想过自杀").shouldEscalate).toBe(false);
  });

  it("CRITICAL: '控制不住想自杀' STAYS high (not a denial)", () => {
    const risk = assessRisk("我控制不住想自杀");
    expect(risk.level).toBe("high");
    expect(risk.shouldEscalate).toBe(true);
  });
});

describe("benign lookalikes must NOT escalate", () => {
  it("counting cold-medicine doses is not crisis", () => {
    expect(assessRisk("感冒药一次吃几片合适").shouldEscalate).toBe(false);
  });

  it("counting money is not a lethal-dose inquiry", () => {
    expect(assessRisk("出门前钱我都数好了").level).not.toBe("high");
  });

  it("does not promote medicine proximity without an independent danger signal", () => {
    expect(assessRisk("药就在身边，是医生开的每日处方，我按医嘱服用").shouldEscalate).toBe(false);
    expect(assessRisk("我不想让那个老师永远消失，只想换个班").shouldEscalate).toBe(false);
    expect(assessRisk("我把整瓶水都喝了").shouldEscalate).toBe(false);
  });

  it("requires dangerous preparation or confrontation in addition to ordinary equipment", () => {
    expect(assessRisk("我准备好晒衣服了，绳子已经挂在房梁上系好了").shouldEscalate).toBe(false);
    expect(assessRisk("我现在就在他楼下，刀在包里，我来归还厨刀").shouldEscalate).toBe(false);
    expect(assessRisk("我现在就在他楼下，今天必须做个了断，谈完分手我就走").shouldEscalate).toBe(false);
  });

  it.each([
    "我想让这场焦虑永远消失",
    "我想让我的烦恼永远消失",
    "我没有把半瓶安眠药吃了",
    "我在看新闻，有个人把半瓶安眠药吃了",
    "我只是说小说里猎枪已经上膛",
    "我家有把猎枪，但是没有上膛"
  ])("does not promote denied, reported, or non-human danger: %s", (text) => {
    expect(assessRisk(text).shouldEscalate).toBe(false);
  });

  it.each([
    "我没有把半瓶安眠药吃了，但我刚刚把整瓶布洛芬都吞了",
    "我在看新闻，有个人把半瓶安眠药吃了。但我刚刚把整瓶布洛芬都吞了",
    "我只是说小说里猎枪已经上膛，可是我家有把猎枪，子弹也上好了",
    "我看新闻后情绪崩溃，把半瓶安眠药吃了",
    "我看新闻之后情绪崩溃，把半瓶安眠药吃了",
    "我看新闻以后情绪崩溃，把半瓶安眠药吃了",
    "我想让这场焦虑永远消失，我想让那个老师永远消失"
  ])("keeps an independent personal danger statement: %s", (text) => {
    expect(assessRisk(text).shouldEscalate).toBe(true);
  });

  it("scopes a denied bodily symptom without removing a separately reported emergency symptom", () => {
    expect(assessRisk("没有胸口剧痛，也没有喘不上气").flags).not.toContain("medical_red_flag");
    expect(assessRisk("没有胸口剧痛，但是我现在喘不上气").flags).toContain("medical_red_flag");
  });
});
