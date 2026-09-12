import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutSheet, CaseDrawer, ConsentGate, ScaleModal, Sheet, SupportResources } from "./overlays";
import { personaById, STR } from "./data";
import { emptyCaseMap } from "@/lib/types";

afterEach(() => vi.useRealTimers());

describe("accessible dialogs", () => {
  it("isolates the background, loops keyboard focus and returns to the opener on Escape", async () => {
    const user = userEvent.setup();
    function Example() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>打开</button>{open && <Sheet label="检查" onClose={() => setOpen(false)}><h2>检查</h2><button>第一个</button><button>最后一个</button></Sheet>}</>;
    }
    const { container } = render(<Example />);
    const opener = screen.getByRole("button", { name: "打开" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "检查" });
    expect(container).toHaveAttribute("inert");
    expect(within(dialog).getByRole("button", { name: "第一个" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "最后一个" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "第一个" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  it("does not allow Escape to bypass required first-use disclosure", async () => {
    const user = userEvent.setup();
    const accept = vi.fn();
    const { container } = render(<><button>背景发送</button><ConsentGate lang="zh" onAccept={accept} /></>);
    expect(container).toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "在开始之前" })).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "年龄范围（可跳过）" }), "minor");
    expect(screen.getByText(STR.zh.minor_note)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "我了解了，开始对话" }));
    expect(accept).toHaveBeenCalledOnce();
  });

  it("closes only the top dialog and restores the parent focus before returning to the page", async () => {
    const user = userEvent.setup();
    function Nested() {
      const [open, setOpen] = useState(false);
      const [child, setChild] = useState(false);
      return <><button onClick={() => setOpen(true)}>打开外层</button>{open && <Sheet label="外层" onClose={() => setOpen(false)}><button onClick={() => setChild(true)}>打开内层</button>{child && <Sheet label="内层" onClose={() => setChild(false)}><button>内层操作</button></Sheet>}</Sheet>}</>;
    }
    const { container } = render(<Nested />);
    await user.click(screen.getByRole("button", { name: "打开外层" }));
    const childOpener = screen.getByRole("button", { name: "打开内层" });
    await user.click(childOpener);
    expect(screen.getByRole("dialog", { name: "内层" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "外层" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "外层" })).toBeInTheDocument();
    expect(childOpener).toHaveFocus();
    expect(container).toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    expect(container).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "打开外层" })).toHaveFocus();
  });
});

describe("support and self-check safety", () => {
  it("does not infer location from language and keeps the selected region on language changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SupportResources lang="zh" />);
    expect(screen.getByRole("combobox")).toHaveValue("OTHER");
    expect(screen.queryByRole("link", { name: /12356/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox"), "CN");
    expect(screen.getByRole("link", { name: /12356/ })).toHaveAttribute("href", "tel:12356");
    rerender(<SupportResources lang="en" />);
    expect(screen.getByRole("combobox")).toHaveValue("CN");
    expect(screen.getByRole("link", { name: /12356/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^988/ })).not.toBeInTheDocument();
  });

  it("shows direct support for a positive PHQ-9 critical item even at total score 1", async () => {
    const user = userEvent.setup();
    const complete = vi.fn();
    render(<ScaleModal lang="zh" scaleId="PHQ-9" region="CN" onClose={vi.fn()} onComplete={complete} />);
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole("button", { name: "完全没有" }));
      await user.click(screen.getByRole("button", { name: "下一题" }));
    }
    await user.click(screen.getByRole("button", { name: "有几天" }));
    expect(screen.getByText(STR.zh.scale_safety_note)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /12356/ })).toHaveAttribute("href", "tel:12356");
    await user.click(screen.getByRole("button", { name: "看看结果" }));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ total: 1, answers: [0, 0, 0, 0, 0, 0, 0, 0, 1] }));
    expect(screen.getByText(STR.zh.scale_safety_note)).toBeInTheDocument();
    expect(screen.queryByText(/目前看起来没有明显的抑郁困扰/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "好的" })).toBeEnabled();
  });

  it("does not show the critical-item alert when that answer is zero", async () => {
    const user = userEvent.setup();
    render(<ScaleModal lang="zh" scaleId="PHQ-9" onClose={vi.fn()} />);
    for (let i = 0; i < 9; i++) {
      await user.click(screen.getByRole("button", { name: "完全没有" }));
      if (i < 8) await user.click(screen.getByRole("button", { name: "下一题" }));
    }
    await user.click(screen.getByRole("button", { name: "看看结果" }));
    expect(screen.queryByText(STR.zh.scale_safety_note)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "好的" })).toBeEnabled();
  });
});

describe("understanding and backup controls", () => {
  it("allows a user to correct a derived understanding and clear it", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<CaseDrawer lang="zh" onClose={vi.fn()} caseMap={{ ...emptyCaseMap(), presenting: "旧的理解" }} onChange={change} />);
    await user.click(screen.getByRole("button", { name: "修正我的理解" }));
    const description = screen.getByRole("textbox", { name: "主诉" });
    await user.clear(description);
    await user.type(description, "我想修正的描述");
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ presenting: "我想修正的描述" }));
    await user.click(screen.getByRole("button", { name: "清空理解" }));
    expect(change).toHaveBeenLastCalledWith(emptyCaseMap());
  });

  it("shows a failed understanding request with a retry action", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<CaseDrawer lang="zh" onClose={vi.fn()} error="暂时无法更新理解" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法更新理解");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers an explicit export and import with a sensitive-data explanation", async () => {
    const user = userEvent.setup();
    const exportData = vi.fn();
    const importData = vi.fn();
    render(<AboutSheet lang="zh" companion={personaById("linxi")} onClose={vi.fn()} onExportData={exportData} onImportData={importData} />);
    expect(screen.getByText(/文件包含敏感的对话内容/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导出我的记录" }));
    expect(exportData).toHaveBeenCalledOnce();
    const file = new File(['{"version":1}'], "backup.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("导入记录"), file);
    expect(importData).toHaveBeenCalledWith(file);
  });

  it("presents retained user edits as a notice with optional manual update, not an error", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    render(<CaseDrawer lang="zh" onClose={vi.fn()} notice="已保留你的修改" onRetry={update} />);
    expect(screen.getByText("已保留你的修改")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新整理" }));
    expect(update).toHaveBeenCalledOnce();
  });
});
