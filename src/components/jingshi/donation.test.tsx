import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DonateSession, SessionHistory } from "./session-panels";
import { STR } from "./data";
import type { SessionRecord } from "./session-state";

const t = STR.zh;
const session = (extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id: "s1", createdAt: "2026-10-06T08:00:00.000Z", summary: "合成小结", nextStep: "", scaleResults: [], caseMap: null,
  messages: [
    { id: "m1", role: "user", content: "我叫李小明，最近考试压力很大，电话13812345678" },
    { id: "m2", role: "assistant", content: "听起来这段时间压力挺大的。", safety: "safe", pace: "fast" },
  ],
  ...extra,
});
afterEach(() => vi.unstubAllGlobals());

describe("conversation donation", () => {
  it("shows a masked preview and sends only after a 14+ age and explicit consent", async () => {
    const network = vi.fn(async () => Response.json({ id: "6f1c2b8e-1d2a-4c3b-9a8d-7e6f5a4b3c2d" }));
    vi.stubGlobal("fetch", network);
    const donated = vi.fn();
    const user = userEvent.setup();
    render(<DonateSession lang="zh" session={session()} ageRange="unspecified" region="CN" onDonated={donated} onClose={vi.fn()} />);
    expect(screen.getByText(/我叫\[NAME\]，最近考试压力很大，电话\[PHONE\]/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: t.donate_submit });
    await user.click(screen.getByRole("checkbox", { name: t.donate_consent }));
    expect(submit).toBeDisabled(); // no age chosen yet
    await user.click(screen.getByRole("radio", { name: t.donate_age_child }));
    expect(screen.getByText(t.donate_under14)).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: t.donate_age_teen }));
    await user.click(submit);
    await waitFor(() => expect(donated).toHaveBeenCalledWith("6f1c2b8e-1d2a-4c3b-9a8d-7e6f5a4b3c2d"));
    const body = JSON.parse(String((network.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ ageBracket: "14-17", language: "zh", supportRegion: "CN" });
    expect(body.messages[0].content).toBe("我叫[NAME]，最近考试压力很大，电话[PHONE]");
    expect(screen.getByText(t.donate_done)).toBeInTheDocument();
  });

  it("needs at least one of the donor's own messages", async () => {
    const user = userEvent.setup();
    render(<DonateSession lang="zh" session={session()} ageRange="adult" region="CN" onDonated={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: /我叫/ }));
    await user.click(screen.getByRole("checkbox", { name: t.donate_consent }));
    expect(screen.getByRole("alert")).toHaveTextContent(t.donate_empty);
    expect(screen.getByRole("button", { name: t.donate_submit })).toBeDisabled();
  });

  it("does not offer a conversation that went through a safety intervention", () => {
    const crisis = session({ messages: [...session().messages, { id: "m3", role: "assistant", content: "安全提示", safety: "crisis" }] });
    render(<DonateSession lang="zh" session={crisis} ageRange="adult" region="CN" onDonated={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(t.donate_crisis)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.donate_submit })).not.toBeInTheDocument();
  });

  it("lists donate or withdraw per saved session", async () => {
    const donate = vi.fn(), withdraw = vi.fn();
    const user = userEvent.setup();
    render(<SessionHistory lang="zh" sessions={[session(), session({ id: "s2", donationId: "6f1c2b8e-1d2a-4c3b-9a8d-7e6f5a4b3c2d" })]} onResume={vi.fn()} onDelete={vi.fn()} onDonate={donate} onWithdraw={withdraw} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: t.donate_button }));
    expect(donate).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
    await user.click(screen.getByRole("button", { name: t.donate_withdraw }));
    expect(withdraw).toHaveBeenCalledWith(expect.objectContaining({ id: "s2" }));
  });
});
