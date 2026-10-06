import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Bubble, Composer, PrivacyRibbon, TopBar } from "./chat-parts";
import { personaById, STR } from "./data";
import { MAX_IMAGE_BYTES } from "@/lib/media-limits";

describe("composer input and attachment recovery", () => {
  it("keeps an IME confirmation in the draft, then permits a separate Enter to send", async () => {
    const send = vi.fn();
    render(<Composer lang="zh" pace="fast" busy={false} onSend={send} onPace={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "我想聊一聊" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    expect(send).not.toHaveBeenCalled();
    expect(input).toHaveValue("我想聊一聊");
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).toHaveBeenCalledWith("我想聊一聊", []);
  });

  it("does not send on a native IME event even if compositionStart was missed", () => {
    const send = vi.fn();
    render(<Composer lang="zh" pace="fast" busy={false} onSend={send} onPace={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "中文" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an oversized image visibly and leaves the user able to choose another", async () => {
    const user = userEvent.setup();
    render(<Composer lang="zh" pace="fast" busy={false} onSend={vi.fn()} onPace={vi.fn()} />);
    const upload = screen.getByLabelText(STR.zh.import_image, { selector: "input" });
    await user.upload(upload, new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }));
    expect(screen.getByRole("alert")).toHaveTextContent("3MiB");
    expect(screen.queryByRole("img", { name: "large.png" })).not.toBeInTheDocument();
    await user.upload(upload, new File(["image"], "small.png", { type: "image/png" }));
    expect(await screen.findByRole("img", { name: "small.png" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "发送" })).toBeEnabled());
  });

  it("offers explicit stop while a request is busy", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    render(<Composer lang="zh" pace="fast" busy onSend={vi.fn()} onPace={vi.fn()} onStop={stop} />);
    await user.click(screen.getByRole("button", { name: "停止回应" }));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not offer a text-only retry after a lost image", () => {
    render(<Bubble lang="zh" persona={personaById("linxi")} m={{ id: "m2", role: "assistant", content: "图片未能处理", errored: true, retryable: false, hadImages: true }} onRetry={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(screen.getByText("请重新添加图片后发送。")).toBeInTheDocument();
  });
});

describe("voice input", () => {
  class FakeRecognition {
    static last: FakeRecognition;
    lang = ""; continuous = false; interimResults = false;
    onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn(); abort = vi.fn();
    stop = vi.fn(() => this.onend?.());
    constructor() { FakeRecognition.last = this; }
  }

  it("is hidden when the browser has no speech recognition", () => {
    render(<Composer lang="zh" pace="fast" busy={false} onSend={vi.fn()} onPace={vi.fn()} />);
    expect(screen.queryByRole("button", { name: STR.zh.voice_start })).not.toBeInTheDocument();
  });

  it("appends what was heard to the draft for review, and never sends by itself", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    const send = vi.fn();
    const user = userEvent.setup();
    render(<Composer lang="zh" pace="fast" busy={false} onSend={send} onPace={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "今天");
    await user.click(screen.getByRole("button", { name: STR.zh.voice_start }));
    const rec = FakeRecognition.last;
    expect(rec.lang).toBe("zh-CN");
    expect(rec.start).toHaveBeenCalledOnce();
    act(() => rec.onresult?.({ results: [[{ transcript: "有点累" }], [{ transcript: "，想早点睡" }]] }));
    expect(screen.getByRole("textbox")).toHaveValue("今天有点累，想早点睡");
    await user.click(screen.getByRole("button", { name: STR.zh.voice_stop }));
    expect(rec.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: STR.zh.voice_start })).toHaveAttribute("aria-pressed", "false");
    expect(send).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("explains a blocked microphone or unreachable speech service", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    const user = userEvent.setup();
    render(<Composer lang="en" pace="fast" busy={false} onSend={vi.fn()} onPace={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: STR.en.voice_start }));
    expect(FakeRecognition.last.lang).toBe("en-US");
    act(() => { FakeRecognition.last.onerror?.({ error: "network" }); FakeRecognition.last.onend?.(); });
    expect(screen.getByRole("alert")).toHaveTextContent(STR.en.voice_network);
    await user.click(screen.getByRole("button", { name: STR.en.voice_start }));
    act(() => { FakeRecognition.last.onerror?.({ error: "not-allowed" }); FakeRecognition.last.onend?.(); });
    expect(screen.getByRole("alert")).toHaveTextContent(STR.en.voice_denied);
    vi.unstubAllGlobals();
  });
});

describe("always available controls", () => {
  it("labels retrieved references without claiming they verify every generated assertion", () => {
    render(<Bubble lang="zh" persona={personaById("linxi")} m={{ id: "sources", role: "assistant", content: "可以慢慢聊。", refs: [{ title: "心理健康资料", url: "https://www.nimh.nih.gov/health/topics/caring-for-your-mental-health", source: "NIMH" }] }} />);
    expect(screen.getByText("本轮参考资料 · 1 条（点开核对原文）")).toBeInTheDocument();
    expect(screen.getByText(/不代表回答中的每个判断已被验证/)).toBeInTheDocument();
    expect(screen.queryByText(/这条回应参考了下面这些权威来源/)).not.toBeInTheDocument();
  });
  it("allows keyboard activation of local deletion", async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(<PrivacyRibbon lang="zh" onDelete={remove} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "删除本地记录" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(remove).toHaveBeenCalledOnce();
  });

  it("exposes human support before sending a message", async () => {
    const user = userEvent.setup();
    const support = vi.fn();
    render(<TopBar lang="zh" theme="light" persona={personaById("linxi")} onTheme={vi.fn()} onLang={vi.fn()} onPersona={vi.fn()} onCase={vi.fn()} onSupport={support} />);
    await user.click(screen.getByRole("button", { name: "真人支持" }));
    expect(support).toHaveBeenCalledOnce();
  });
});
