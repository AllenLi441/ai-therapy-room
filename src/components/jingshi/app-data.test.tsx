import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { CONSENT_VERSION } from "./session-state";
import { STR, type Message } from "./data";
import { emptyCaseMap } from "@/lib/types";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const initial: Message[] = [
  { id: "u1", role: "user", content: "合成测试里的第一段工作烦恼" },
  { id: "a1", role: "assistant", content: "合成的第一段回应", replyToId: "u1" },
  { id: "u2", role: "user", content: "合成测试里的第二段工作烦恼" },
  { id: "a2", role: "assistant", content: "合成的第二段回应", replyToId: "u2" },
];
function seed(messages = initial) { localStorage.setItem("js_consent", CONSENT_VERSION); localStorage.setItem("js_chat", JSON.stringify(messages)); }
const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); if (descriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", descriptor); else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView; });
async function eraseAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "删除本地记录" }));
  const dialog = screen.getByRole("dialog", { name: "删除此浏览器的对话记录？" });
  await user.click(within(dialog).getByRole("button", { name: "删除本地记录" }));
}
async function removeMessage(user: ReturnType<typeof userEvent.setup>, index: number) {
  await user.click(screen.getAllByRole("button", { name: STR.zh.msg_delete })[index]);
  await user.click(screen.getByRole("button", { name: STR.zh.msg_delete_confirm }));
}

describe("App deletion and request lifetime", () => {
  it("never restores a late understanding after deleting all records", async () => {
    seed(); const response = deferred<Response>(); let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => { signal = init.signal; return response.promise; }));
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole("button", { name: "对你的理解" }));
    expect(await screen.findByText(STR.zh.case_loading)).toBeInTheDocument();
    await user.keyboard("{Escape}"); await eraseAll(user);
    expect(signal?.aborted).toBe(true);
    await act(async () => response.resolve(Response.json({ plan: { caseMap: { ...emptyCaseMap(), presenting: "不应复活的已删除理解" } } })));
    expect(localStorage.getItem("js_case")).toBeNull();
    expect(screen.queryByText("不应复活的已删除理解")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "在开始之前" })).toBeInTheDocument();
  });

  it("invalidates failed-turn retry and derived snapshots when its user message is deleted", async () => {
    seed([{ id: "u1", role: "user", content: "需要删除的合成原文" }, { id: "a1", role: "assistant", replyToId: "u1", content: "发送失败", errored: true }]);
    localStorage.setItem("js_feedback", JSON.stringify([{ userText: "需要删除的合成原文" }]));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup(); render(<App />);
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    await removeMessage(user, 0);
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(screen.queryByText("需要删除的合成原文")).not.toBeInTheDocument();
    expect(localStorage.getItem("js_feedback")).toBeNull();
    expect(localStorage.getItem("js_chat")).not.toContain("需要删除的合成原文");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("drops an error body that arrives after the source message was deleted", async () => {
    seed(initial.map((m) => m.id === "a2" ? { ...m, errored: true } : m));
    const body = deferred<{ message: string }>();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, headers: new Headers(), json: () => body.promise })));
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole("button", { name: "重试" }));
    await removeMessage(user, 2);
    await act(async () => body.resolve({ message: "已经过期的错误正文" }));
    expect(screen.queryByText("已经过期的错误正文")).not.toBeInTheDocument();
    expect(localStorage.getItem("js_chat")).not.toContain("已经过期的错误正文");
  });

  it("invalidates a pending understanding before retrying a failed turn", async () => {
    seed(initial.map((m) => m.id === "a2" ? { ...m, errored: true } : m));
    const plan = deferred<Response>(); let planSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((url, init) => { if (url === "/api/plan") { planSignal = init.signal; return plan.promise; } if (url === "/api/chat") return Promise.resolve(new Response("合成的新回应")); throw new Error("unexpected_network"); }));
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole("button", { name: "对你的理解" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("合成的新回应")).toBeInTheDocument();
    expect(planSignal?.aborted).toBe(true);
    await act(async () => plan.resolve(Response.json({ plan: { caseMap: { ...emptyCaseMap(), presenting: "过时的合成理解" } } })));
    expect(localStorage.getItem("js_case")).toBeNull();
  });

  it("does not turn a restored unread image into a successful text-only retry", async () => {
    seed([{ id: "u1", role: "user", content: "帮我看看这张图", hadImages: true }, { id: "a1", role: "assistant", replyToId: "u1", content: "图片读取失败", errored: true }]);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText(/原图不会保存在浏览器记录中/)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
  });

  it("cancels image interpretation on deletion and never starts the old chat", async () => {
    seed([]); const vision = deferred<Response>(); let signal: AbortSignal | undefined;
    const fetcher = vi.fn((url, init) => { if (url !== "/api/vision") throw new Error("old_chat_must_not_start"); signal = init.signal; return vision.promise; }); vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup(); render(<App />);
    await user.upload(screen.getByLabelText("导入图片", { selector: "input" }), new File(["synthetic-image"], "sample.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "发送" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await eraseAll(user);
    expect(signal?.aborted).toBe(true);
    await act(async () => vision.resolve(Response.json({ description: "已删除图片的合成描述" })));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(localStorage.getItem("js_chat")).not.toContain("已删除图片");
  });
});
