import { describe, expect, it } from "vitest";
import { modelMessages, parseRecordBackup, readMessages, readSessions, RequestScope, storedMessages } from "./session-state";

describe("record backup contracts", () => {
  it("round trips image state and descriptions without persisting raw images or reasoning", () => {
    const stored = storedMessages([{ id: "u1", role: "user", content: "看看图片", hadImages: true, modelContent: "合成图片描述", media: [{ id: "im", type: "image", url: "data:image/png;base64,AAAA" }], thinking: "不保存的推理" }]);
    expect(JSON.stringify(stored)).not.toMatch(/base64|不保存的推理/);
    expect(readMessages(stored)[0]).toMatchObject({ hadImages: true, modelContent: "合成图片描述" });
  });
  it("rejects unrelated files and ignores malformed record dates without crashing the history", () => {
    expect(() => parseRecordBackup({ feedback: [] })).toThrow("invalid_backup");
    expect(readSessions([{ id: "bad", createdAt: "not-a-date", messages: [] }])).toEqual([]);
  });
  it("keeps exported in-progress replies visibly incomplete and out of future model history", () => {
    const restored = readMessages(storedMessages([{ id: "a", role: "assistant", content: "还没说完的合成回应", streaming: true }]));
    expect(restored[0]).toMatchObject({ errored: true, streaming: false });
    expect(modelMessages(restored)).toEqual([]);
  });
  it("does not send failed assistant responses into future model history", () => {
    expect(modelMessages([{ id: "u", role: "user", content: "合成用户消息" }, { id: "a", role: "assistant", content: "旧错误或半段回复", errored: true }])).toEqual([{ role: "user", content: "合成用户消息" }]);
  });
  it("keeps a long conversation within the API limit and includes the newest message", () => {
    const messages = Array.from({ length: 125 }, (_, i) => ({ id: String(i), role: "user" as const, content: `合成消息${i}` }));
    const payload = modelMessages(messages);
    expect(payload).toHaveLength(120);
    expect(payload.at(-1)?.content).toBe("合成消息124");
  });
  it("aborts all in-flight requests and invalidates even responses that ignore cancellation", () => {
    const scope = new RequestScope(); const chat = scope.start(), plan = scope.start(); scope.invalidate();
    expect(chat.signal.aborted).toBe(true); expect(plan.signal.aborted).toBe(true); expect(plan.current()).toBe(false);
    expect(scope.start().current()).toBe(true);
  });
});
