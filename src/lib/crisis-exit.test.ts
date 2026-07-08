import { describe, expect, it } from "vitest";
import { assessConversationRisk, detectActiveCrisisFromHistory, createCrisisResponse, assessRisk } from "./safety";
import type { ChatMessage } from "./types";

// P0: prove the crisis "safety mode" state machine can be ENTERED and, crucially,
// EXITED — both by the user saying they're okay and by simply moving on. The bug
// was that crisis mode was self-perpetuating (the crisis template re-fired every
// turn and its own text re-armed the crisis marker), so the user got stuck.

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });
const crisisReply = () => createCrisisResponse(assessRisk("我不想活了"));

describe("P0 — crisis state machine: enter → linger → exit", () => {
  it("ENTERS crisis on an explicit risk message (route would send the template)", () => {
    const risk = assessConversationRisk([u("我最近真的不想活了")]);
    expect(risk.shouldEscalate).toBe(true);
  });

  it("a benign follow-up does NOT itself escalate → route replies normally, no template loop", () => {
    // The route fires the full template only on the CURRENT turn's own risk
    // (baseRisk.shouldEscalate). A calm follow-up must not re-escalate.
    const benign = assessConversationRisk([u("谢谢你，我现在好多了，我们聊点别的吧，比如周末去哪玩")]);
    expect(benign.shouldEscalate).toBe(false);
    expect(benign.level === "none" || benign.level === "low").toBe(true);
  });

  it("right after a crisis reply, safety posture lingers (active) but is NOT a stuck template", () => {
    const history: ChatMessage[] = [u("我不想活了"), a(crisisReply()), u("嗯")];
    const inferred = detectActiveCrisisFromHistory(history);
    expect(inferred.active).toBe(true);
    expect(inferred.deescalated).toBe(false);
  });

  it("EXITS immediately when the user says they're okay (explicit de-escalation)", () => {
    const history: ChatMessage[] = [u("我不想活了"), a(crisisReply()), u("我现在好多了，没事了，谢谢你")];
    const inferred = detectActiveCrisisFromHistory(history);
    expect(inferred.deescalated).toBe(true);
    expect(inferred.active).toBe(false);
  });

  it("a calm affirmation does NOT release crisis while lethal means are stated on hand", () => {
    const history: ChatMessage[] = [u("我不想活了"), a(crisisReply()), u("我好多了，不过药还在我床边")];
    const inferred = detectActiveCrisisFromHistory(history);
    expect(inferred.deescalated).toBe(false); // safety guard holds
  });

  it("AGES OUT: once the crisis reply leaves the recent window, posture clears on its own", () => {
    const history: ChatMessage[] = [
      u("我不想活了"), a(crisisReply()),
      u("嗯"), a("我在听，慢慢来。"),
      u("今天天气不错"), a("是呀，晒晒太阳也好。"),
      u("我想聊聊工作"), a("好啊，工作上发生了什么？"),
      u("还有学习"), a("学习上最近怎么样？"),
      u("就是有点累")
    ];
    const inferred = detectActiveCrisisFromHistory(history);
    expect(inferred.active).toBe(false);
  });

  // The regression you found: after exiting, the next message wouldn't get a normal
  // reply because the multi-turn AGGREGATE still saw the earlier "我不想活了".
  it("the multi-turn aggregate re-detects an earlier crisis line (why exit must judge the latest msg)", () => {
    const benignFollowUp: ChatMessage[] = [u("我最近真的不想活了"), u("谢谢你，我们聊点别的吧")];
    expect(assessConversationRisk(benignFollowUp).shouldEscalate).toBe(true); // would re-trap
  });

  it("after exit, judging the LATEST message alone does NOT re-escalate → normal reply (the fix)", () => {
    expect(assessRisk("谢谢你，我们聊点别的吧").shouldEscalate).toBe(false);
  });

  it("…but a genuinely risky CURRENT message still escalates even after exit (safety preserved)", () => {
    expect(assessRisk("其实我又开始想死了").shouldEscalate).toBe(true);
  });
});
