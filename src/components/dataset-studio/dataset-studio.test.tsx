import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatasetStudio } from "./dataset-studio";

const authorKey = "jingshi.dataset-studio.author.v1";
const reviewerKey = "jingshi.dataset-studio.reviewer.v1";
const modeKey = "jingshi.dataset-studio.mode.v1";

afterEach(() => vi.useRealTimers());

describe("Dataset Studio local drafts", () => {
  it("renders a hydration placeholder on the server without exposing local drafts", () => {
    localStorage.setItem(authorKey, JSON.stringify({ batch: "private-draft" }));
    const html = renderToString(<DatasetStudio />);
    expect(html).toContain("正在恢复本机草稿");
    expect(html).not.toContain("private-draft");
  });

  it("restores reviewer mode before saving, and persists edits when leaving immediately", () => {
    vi.useFakeTimers();
    localStorage.setItem(modeKey, "reviewer");
    localStorage.setItem(reviewerKey, JSON.stringify({ annotatorId: "H02", sourceName: "", items: [], selected: 9 }));
    const view = render(<DatasetStudio />);
    expect(screen.getByPlaceholderText("例如 H01")).toHaveValue("H02");
    expect(localStorage.getItem(modeKey)).toBe("reviewer");
    fireEvent.change(screen.getByPlaceholderText("例如 H01"), { target: { value: "H03" } });
    view.unmount();
    expect(JSON.parse(localStorage.getItem(reviewerKey)!)).toMatchObject({ annotatorId: "H03", selected: 0 });
    expect(localStorage.getItem(modeKey)).toBe("reviewer");
  });

  it("recovers a null draft and reports saving only after the latest edit is persisted", () => {
    vi.useFakeTimers();
    localStorage.setItem(authorKey, "null");
    render(<DatasetStudio />);
    const batch = screen.getByLabelText("批次");
    expect(batch).toHaveValue("expansion_pilot_2026_07");
    fireEvent.change(batch, { target: { value: "new-batch" } });
    act(() => vi.advanceTimersByTime(200));
    expect(JSON.parse(localStorage.getItem(authorKey)!)).toMatchObject({ batch: "new-batch" });
    expect(screen.getByText(/已于 .* 保存在本机/)).toBeInTheDocument();
  });
});
