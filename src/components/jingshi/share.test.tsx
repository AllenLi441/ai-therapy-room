import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { ConsentGate, shareFor } from "./overlays";
import { CONSENT_VERSION } from "./session-state";
import { STR } from "./data";
import { EVENT_DELIM } from "@/lib/stream-markers";

const t = STR.zh;
const reply = (text = "这是合成的陪伴回复。") => new Response(`${EVENT_DELIM}${JSON.stringify({ type: "safety", status: "safe" })}${EVENT_DELIM}${text}`);
const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubEnv("NEXT_PUBLIC_DONATIONS", "1");
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear();
  if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scroll);
});

describe("share choice rules", () => {
  it("allows agreeing only with a 14+ age", () => {
    expect(shareFor(null, "adult", false)).toBeNull();
    expect(shareFor("no", "unspecified", false)).toBe("off");
    expect(shareFor("yes", "adult", false)).toBe("18+");
    expect(shareFor("yes", "minor", true)).toBe("14-17");
    expect(shareFor("yes", "minor", false)).toBeNull();
    expect(shareFor("yes", "unspecified", true)).toBeNull();
  });
});

describe("opening consent asks about uploading conversations", () => {
  it("needs an answer, and an age for agreeing", async () => {
    const accept = vi.fn();
    const user = userEvent.setup();
    render(<ConsentGate lang="zh" sharing onAccept={accept} />);
    const enter = screen.getByRole("button", { name: t.consent_enter });
    expect(enter).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: t.share_yes }));
    expect(screen.getByText(t.share_need_age)).toBeInTheDocument();
    expect(enter).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: t.age_label }), "minor");
    expect(enter).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: t.share_14 }));
    await user.click(enter);
    expect(accept).toHaveBeenCalledWith("14-17");
  });

  it("enters with sharing off after 不同意", async () => {
    const accept = vi.fn();
    const user = userEvent.setup();
    render(<ConsentGate lang="zh" sharing onAccept={accept} />);
    await user.click(screen.getByRole("radio", { name: t.share_no }));
    await user.click(screen.getByRole("button", { name: t.consent_enter }));
    expect(accept).toHaveBeenCalledWith("off");
  });
});

describe("uploading after agreement", () => {
  it("uploads each reply into one row per conversation, and deletes it from Settings", async () => {
    const network = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/donate") return Response.json(init?.method === "DELETE" ? { ok: true } : { id: JSON.parse(String(init?.body)).id });
      return reply();
    });
    vi.stubGlobal("fetch", network);
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByRole("combobox", { name: t.age_label }), "adult");
    await user.click(screen.getByRole("radio", { name: t.share_yes }));
    await user.click(screen.getByRole("button", { name: t.consent_enter }));
    expect(localStorage.getItem("js_consent")).toBe(CONSENT_VERSION);

    const send = async (text: string) => { await user.type(screen.getByRole("textbox"), text); await user.click(screen.getByRole("button", { name: t.send })); };
    const uploads = () => network.mock.calls.filter(([url, init]) => url === "/api/donate" && init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)));
    await send("最近考试压力很大");
    await waitFor(() => expect(uploads()).toHaveLength(1));
    await send("晚上也睡不着");
    await waitFor(() => expect(uploads()).toHaveLength(2));
    const [first, second] = uploads();
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ ageBracket: "18+", language: "zh" });
    expect(second.messages.filter((m: { role: string }) => m.role === "user").map((m: { content: string }) => m.content)).toEqual(["最近考试压力很大", "晚上也睡不着"]);

    await user.click(screen.getByRole("button", { name: t.settings_title }));
    await user.click(screen.getByRole("button", { name: t.share_delete }));
    await waitFor(() => expect(screen.getByText(t.share_deleted)).toBeInTheDocument());
    const deletion = network.mock.calls.find(([url, init]) => url === "/api/donate" && init?.method === "DELETE");
    expect(JSON.parse(String(deletion?.[1]?.body))).toEqual({ id: first.id });

    // Turning it off in Settings stops further uploads.
    await user.click(screen.getByRole("radio", { name: t.share_no }));
    await user.click(screen.getByRole("button", { name: t.close }));
    await send("今天好一点了");
    await waitFor(() => expect(network.mock.calls.filter(([url]) => url === "/api/chat")).toHaveLength(3));
    expect(uploads()).toHaveLength(2);
  });

  it("never uploads after 不同意", async () => {
    const network = vi.fn(async () => reply());
    vi.stubGlobal("fetch", network);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("radio", { name: t.share_no }));
    await user.click(screen.getByRole("button", { name: t.consent_enter }));
    await user.type(screen.getByRole("textbox"), "普通的一天");
    await user.click(screen.getByRole("button", { name: t.send }));
    await waitFor(() => expect(network).toHaveBeenCalledTimes(1));
    expect(network.mock.calls.every(([url]) => url === "/api/chat")).toBe(true);
  });
});
