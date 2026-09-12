import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { CONSENT_VERSION } from "./session-state";
import { SUPPORT_REGION_CODES } from "@/lib/support-regions";

const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => {
  localStorage.setItem("js_consent", CONSENT_VERSION);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scroll);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

describe("region selection and migration", () => {
  it("restores old combined settings without losing messages and offers independent UK and Ireland choices", async () => {
    localStorage.setItem("js_support_region", "UK_IE");
    localStorage.setItem("js_chat", JSON.stringify([{ id: "kept", role: "user", content: "迁移前的合成对话" }]));
    const user = userEvent.setup(); render(<App />);
    expect(screen.getByText("迁移前的合成对话")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "真人支持" }));
    const selector = screen.getByRole("combobox", { name: "支持资源地区" });
    expect(selector).toHaveValue("UK_IE");
    for (const code of SUPPORT_REGION_CODES) expect(selector.querySelector(`option[value="${code}"]`)).not.toBeNull();
    await user.selectOptions(selector, "IE");
    expect(localStorage.getItem("js_support_region")).toBe("IE");
    expect(localStorage.getItem("js_chat")).toContain("迁移前的合成对话");
  });

  it("keeps a newly selected region through language changes and remounts, then sends the canonical API value", async () => {
    const network = vi.fn<typeof fetch>(async () => new Response("A synthetic reply."));
    vi.stubGlobal("fetch", network);
    const user = userEvent.setup(); const first = render(<App />);
    await user.click(screen.getByRole("button", { name: "真人支持" }));
    await user.selectOptions(screen.getByRole("combobox"), "CA");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "切换语言" }));
    first.unmount(); render(<App />);
    await user.click(screen.getByRole("button", { name: "Human support" }));
    expect(screen.getByRole("combobox", { name: "Support resource region" })).toHaveValue("CA");
    await user.keyboard("{Escape}");
    await user.type(screen.getByRole("textbox"), "A quiet day.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("A synthetic reply.")).toBeInTheDocument();
    expect(JSON.parse(String(network.mock.calls[0][1]?.body))).toMatchObject({ supportRegion: "CA", language: "en" });
  });

  it("exports a new region and imports it back only after replacement confirmation", async () => {
    localStorage.setItem("js_support_region", "JP");
    localStorage.setItem("js_chat", JSON.stringify([{ id: "backup", role: "user", content: "备份里的合成对话" }]));
    let exported!: Blob;
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL(blob: Blob) { exported = blob; return "blob:synthetic-backup"; }
      static revokeObjectURL() {}
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup(); const first = render(<App />);
    await user.click(screen.getByRole("button", { name: "关于安屿" }));
    await user.click(screen.getByRole("button", { name: "导出我的记录" }));
    const contents = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(exported); });
    expect(JSON.parse(contents).settings.supportRegion).toBe("JP");
    first.unmount(); localStorage.setItem("js_support_region", "DE");
    localStorage.setItem("js_chat", JSON.stringify([{ id: "current", role: "user", content: "确认前的合成对话" }]));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "关于安屿" }));
    const file = new File([contents], "jingshi-records.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => contents });
    await user.upload(screen.getByLabelText("导入记录"), file);
    expect(await screen.findByRole("button", { name: "替换并导入" })).toBeInTheDocument();
    expect(localStorage.getItem("js_support_region")).toBe("DE");
    await user.click(screen.getByRole("button", { name: "替换并导入" }));
    await waitFor(() => expect(localStorage.getItem("js_support_region")).toBe("JP"));
    expect(screen.getByText("备份里的合成对话")).toBeInTheDocument();
  });
});
