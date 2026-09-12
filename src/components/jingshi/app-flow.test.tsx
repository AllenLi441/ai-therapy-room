import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { CONSENT_VERSION } from "./session-state";
import { STR } from "./data";
import { EVENT_DELIM } from "@/lib/stream-markers";
import { assessRisk } from "@/lib/safety";

const reply = (text = "这是合成的陪伴回复。", status = "safe") => new Response(
  `${EVENT_DELIM}${JSON.stringify({ type: "safety", status })}${EVENT_DELIM}${text}`,
  { headers: { "Content-Type": "text/plain; charset=utf-8" } }
);

const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), text);
  await user.click(screen.getByRole("button", { name: "发送" }));
}

describe("App consent, settings and safety flow", () => {
  it("requires the revised disclosure before sending, including when old consent exists", async () => {
    localStorage.setItem("js_consent", "1");
    const network = vi.fn(async () => reply());
    vi.stubGlobal("fetch", network);
    render(<App />);
    expect(screen.getByRole("dialog", { name: "在开始之前" })).toBeInTheDocument();
    // A directly dispatched background event must still fail the application guard.
    fireEvent.click(screen.getByRole("button", { name: "我最近睡不太好", hidden: true }));
    expect(network).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "我了解了，开始对话" }));
    expect(localStorage.getItem("js_consent")).toBe(CONSENT_VERSION);
    await send("我想了解这里");
    expect(await screen.findByText("这是合成的陪伴回复。")).toBeInTheDocument();
    expect(network).toHaveBeenCalledOnce();
  });

  it("preserves selected language and theme across an App remount", async () => {
    localStorage.setItem("js_consent", CONSENT_VERSION);
    vi.stubGlobal("fetch", vi.fn(async () => reply()));
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(screen.getByRole("button", { name: "切换明暗主题" }));
    await user.click(screen.getByRole("button", { name: "切换语言" }));
    expect(localStorage.getItem("js_theme")).toBe("dark");
    expect(localStorage.getItem("js_lang")).toBe("en");
    first.unmount();
    document.documentElement.lang = "zh";
    document.documentElement.setAttribute("data-theme", "light");
    render(<App />);
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "Change language" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves current explicit danger when a service incorrectly emits safe", async () => {
    localStorage.setItem("js_consent", CONSENT_VERSION);
    let respond!: (response: Response) => void;
    const network = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { respond = resolve; }));
    vi.stubGlobal("fetch", network);
    render(<App />);
    await send("我现在想自杀");
    expect(screen.getByText(STR.zh.crisis_banner_t)).toBeInTheDocument();
    await act(async () => { respond(reply("合成安全复核结果", "safe")); });
    expect(await screen.findByText("合成安全复核结果")).toBeInTheDocument();
    expect(screen.getByText(STR.zh.crisis_banner_t)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-crisis");
    const init = network.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body)).crisisModeActive).toBe(false);
  });

  it.each(["safe", "gentle"])("releases a provisional medium cue after a %s service event", async (status) => {
    localStorage.setItem("js_consent", CONSENT_VERSION);
    const statement = "我快撑不住了";
    expect(assessRisk(statement)).toMatchObject({ shouldEscalate: false, flags: expect.arrayContaining(["suicide_concern"]) });
    let respond!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; })));
    render(<App />);
    await send(statement);
    expect(screen.getByText(STR.zh.crisis_banner_t)).toBeInTheDocument();
    await act(async () => { respond(reply("合成低置信复核结果", status)); });
    expect(await screen.findByText("合成低置信复核结果")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(STR.zh.crisis_banner_t)).not.toBeInTheDocument());
    expect(document.documentElement).not.toHaveAttribute("data-crisis");
  });

  it("opens PHQ-9 from a mixed-concern conversation and keeps critical-item support independent of total score", async () => {
    localStorage.setItem("js_consent", CONSENT_VERSION);
    localStorage.setItem("js_support_region", "CN");
    const network = vi.fn(async () => reply());
    vi.stubGlobal("fetch", network);
    const user = userEvent.setup();
    render(<App />);
    await send("我最近很低落，还失眠睡不着");
    expect(await screen.findByText("这是合成的陪伴回复。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "做个自评" }));
    const dialog = screen.getByRole("dialog", { name: "PHQ-9 · 抑郁自评" });
    for (let i = 0; i < 8; i++) {
      await user.click(within(dialog).getByRole("button", { name: "完全没有" }));
      await user.click(within(dialog).getByRole("button", { name: "下一题" }));
    }
    await user.click(within(dialog).getByRole("button", { name: "有几天" }));
    await user.click(within(dialog).getByRole("button", { name: "看看结果" }));
    expect(within(dialog).getByText(STR.zh.scale_safety_note)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /12356/ })).toHaveAttribute("href", "tel:12356");
    expect(within(dialog).queryByText(/目前看起来没有明显的抑郁困扰/)).not.toBeInTheDocument();
    const scales = JSON.parse(localStorage.getItem("js_scales") || "[]");
    expect(scales).toEqual([expect.objectContaining({ id: "PHQ-9", total: 1, answers: [0, 0, 0, 0, 0, 0, 0, 0, 1] })]);
    await user.click(within(dialog).getByRole("button", { name: "好的" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(STR.zh.crisis_banner_t)).not.toBeInTheDocument();
    expect(network).toHaveBeenCalledOnce();
  });
});

describe("App closing and continuation", () => {
  it("saves a chosen closing note, starts a fresh chat and resumes the saved context", async () => {
    localStorage.setItem("js_consent", CONSENT_VERSION);
    const network = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/summary") return Response.json({ summary: "合成小结：我想为自己留一点空间。" });
      if (String(input) === "/api/chat") return reply();
      throw new Error("Unexpected test request");
    });
    vi.stubGlobal("fetch", network);
    const user = userEvent.setup();
    render(<App />);
    await send("今天工作结束了，我想慢下来");
    expect(await screen.findByText("这是合成的陪伴回复。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "今天先到这里" }));
    const summary = await screen.findByRole("textbox", { name: "这次想记下的" });
    await waitFor(() => expect(summary).toHaveValue("合成小结：我想为自己留一点空间。"));
    await user.type(screen.getByRole("textbox", { name: "我愿意试的一小步（可不填）" }), "明天午间去走走");
    await user.click(screen.getByRole("button", { name: "保存并开始新对话" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "我最近睡不太好" })).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("js_sessions") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ summary: "合成小结：我想为自己留一点空间。", nextStep: "明天午间去走走" });
    await user.click(screen.getByRole("button", { name: "往次记录" }));
    expect(screen.getByText("合成小结：我想为自己留一点空间。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "接着这段聊" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("今天工作结束了，我想慢下来")).toBeInTheDocument();
    await send("我想接着聊昨晚的事情");
    await waitFor(() => expect(network).toHaveBeenCalledTimes(3));
    const init = network.mock.calls[2]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(init?.body));
    expect(payload.continuationNote).toContain("合成小结：我想为自己留一点空间。");
    expect(payload.continuationNote).toContain("明天午间去走走");
    expect(payload.messages).toContainEqual(expect.objectContaining({ role: "user", content: "今天工作结束了，我想慢下来" }));
  });
});
