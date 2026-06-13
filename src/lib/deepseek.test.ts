import { describe, expect, it, vi } from "vitest";
import { buildDeepSeekPayload, getDeepSeekConfig, normalizeConversationForProvider } from "./deepseek";
import type { ChatMessage } from "./types";

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });

describe("deepseek config and payload", () => {
  it("uses safe server-side defaults", () => {
    vi.stubEnv("DEEPSEEK_MODEL", "");
    vi.stubEnv("DEEPSEEK_BASE_URL", "");

    const config = getDeepSeekConfig();

    expect(config.baseUrl).toBe("https://api.deepseek.com");
  });

  it("builds an OpenAI-compatible chat payload", () => {
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v5.5-flash");

    const payload = buildDeepSeekPayload({
      systemPrompt: "system",
      messages: [{ role: "user", content: "你好" }],
      stream: true
    });

    expect(payload.model).toBe("deepseek-v5.5-flash");
    expect(payload.messages[0]).toEqual({ role: "system", content: "system" });
    expect(payload.messages[1]).toEqual({ role: "user", content: "你好" });
    expect(payload.stream).toBe(true);
  });
});

describe("normalizeConversationForProvider", () => {
  it("drops the leading assistant greeting so the dialogue starts with a user turn", () => {
    const out = normalizeConversationForProvider([a("你好，我在这里。"), u("我最近很累"), a("听起来很沉重"), u("是的")]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out[0]).toEqual({ role: "user", content: "我最近很累" });
  });

  it("drops an assistant turn that a slice(-16) window lands on first", () => {
    // After the window kicks in, the array can begin mid-dialogue on assistant.
    const out = normalizeConversationForProvider([a("上一轮回应"), u("接着说"), a("好的"), u("最新一句")]);
    expect(out[0].role).toBe("user");
    expect(out[out.length - 1]).toEqual({ role: "user", content: "最新一句" });
  });

  it("merges consecutive assistant turns from a persona switch", () => {
    const out = normalizeConversationForProvider([u("你好"), a("我是明远"), a("已切换到安然"), u("继续")]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out[1].content).toBe("我是明远\n已切换到安然");
  });

  it("always ends on the latest user turn and strictly alternates", () => {
    const out = normalizeConversationForProvider([
      a("欢迎"),
      u("一"),
      a("回应一"),
      a("人设切换"),
      u("二"),
      u("二点五"),
      a("回应二"),
      u("三")
    ]);
    // No two adjacent turns share a role.
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i].role).not.toBe(out[i - 1].role);
    }
    expect(out[0].role).toBe("user");
    expect(out[out.length - 1]).toEqual({ role: "user", content: "三" });
  });

  it("leaves a clean alternating history untouched", () => {
    const input = [u("一"), a("回应一"), u("二")];
    expect(normalizeConversationForProvider(input)).toEqual(input.map(({ role, content }) => ({ role, content })));
  });

  it("passes a single user message through unchanged", () => {
    expect(normalizeConversationForProvider([u("只有一句")])).toEqual([{ role: "user", content: "只有一句" }]);
  });

  it("is applied inside buildDeepSeekPayload so the provider never sees a leading assistant", () => {
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v5.5-flash");
    const payload = buildDeepSeekPayload({
      systemPrompt: "system",
      messages: [a("欢迎语"), u("我想聊聊"), a("好的"), a("已切换人设"), u("现在呢")]
    });
    expect(payload.messages[0]).toEqual({ role: "system", content: "system" });
    expect(payload.messages.slice(1).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(payload.messages[payload.messages.length - 1]).toEqual({ role: "user", content: "现在呢" });
  });
});
