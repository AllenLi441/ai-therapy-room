import { describe, expect, it } from "vitest";
import { POST } from "./route";

/**
 * Branch-order regression tests for the chat route.
 *
 * The route decides WHICH safety template a user receives via an ordered
 * sequence of branches (crisis → suicide_concern → medication → diagnosis →
 * medical_red_flag → implicit LLM → normal). This ordering is safety-critical:
 * a future reorder that put medication_request ahead of suicide_concern would
 * silently route a suicidal user to a calm "I can't recommend doses" reply.
 *
 * These cases all trigger LEXICON branches that return BEFORE the implicit-LLM
 * call, so they are deterministic and need no API keys / network.
 */
function chatRequest(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, language: "zh" })
  });
}

async function bodyText(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const res = await POST(chatRequest(messages));
  return res.text();
}

describe("chat route — safety branch ordering", () => {
  it("explicit crisis returns the crisis template", async () => {
    const text = await bodyText([{ role: "user", content: "我想跳楼，活不下去了。" }]);
    expect(text).toContain("危险信号");
    expect(text).toContain("急救");
  });

  it("overdose disclosure (P0 fix) routes to CRISIS, not medication boundary", async () => {
    const text = await bodyText([{ role: "user", content: "我刚刚把整瓶安眠药都吞了。" }]);
    expect(text).toContain("危险信号");
    expect(text).not.toContain("不能给你推荐药名、剂量");
  });

  it("subtle ideation returns the suicide-concern template", async () => {
    const text = await bodyText([{ role: "user", content: "如果我不在了，大家应该会轻松一点。" }]);
    expect(text).toContain("认真对待");
  });

  it("CRITICAL ordering: ideation + medication in one message → suicide-concern wins, not medication", async () => {
    const text = await bodyText([
      { role: "user", content: "如果我不在了大家会轻松一点……我该吃什么药、剂量多少？" }
    ]);
    // suicide_concern branch must take precedence over medication_request
    expect(text).toContain("认真对待");
    expect(text).not.toContain("不能给你推荐药名、剂量");
  });

  it("plain medication request returns the medication-boundary template", async () => {
    const text = await bodyText([{ role: "user", content: "你推荐我吃什么药？剂量多少？" }]);
    expect(text).toContain("不能给你推荐药名、剂量");
  });

  it("diagnosis request returns the diagnosis-boundary template", async () => {
    const text = await bodyText([{ role: "user", content: "你帮我诊断一下我是不是抑郁症？" }]);
    expect(text).toContain("不能在聊天里替你诊断");
  });

  it("medical red flag (P0 colloquial fix) routes to medical-first, not psychologized", async () => {
    const text = await bodyText([{ role: "user", content: "我突然胸口剧痛，喘不上气，话也说不清。" }]);
    expect(text).toContain("先把身体风险放在前面");
  });

  // v2: once in an active crisis session, a triggering follow-up must NOT re-dump
  // the identical static template (robotic / re-traumatizing). It should fall
  // through to the contextual model path while the crisis banner stays up so the
  // real hotlines remain one tap away (deterministic floor).
  it("does NOT re-dump the suicide-concern template on a follow-up while already in crisis", async () => {
    const res = await POST(
      chatRequest([
        { role: "user", content: "如果我不在了，大家应该会轻松一点。" },
        { role: "assistant", content: "这句话我会认真对待。……（先前已发过的危机回复）" },
        { role: "user", content: "我还是觉得活着没意思。" }
      ])
    );
    const text = await res.text();
    expect(text).not.toContain("这句话我会认真对待"); // template not repeated verbatim
    expect(res.headers.get("X-Crisis-Triggered")).toBe("1"); // banner persists → resources reachable
  });

  it("first-contact suicide concern still DOES return the template (engage only kicks in on follow-ups)", async () => {
    const text = await bodyText([{ role: "user", content: "如果我不在了，大家应该会轻松一点。" }]);
    expect(text).toContain("这句话我会认真对待");
  });
});
