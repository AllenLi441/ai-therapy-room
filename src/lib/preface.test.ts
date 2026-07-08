import { describe, it, expect } from "vitest";
import { stripLeadingPreface } from "./preface";

const ZH = "我先陪你把这件事放慢一点，我们一点点说。";
const EN = "I am here with you. Let us slow this down together.";

describe("stripLeadingPreface — keeps the model from mimicking its own holding preface", () => {
  it("removes a single leading preface + following whitespace (zh/en)", () => {
    expect(stripLeadingPreface(`${ZH}\n\n你已经撑了很久了。`)).toBe("你已经撑了很久了。");
    expect(stripLeadingPreface(`${EN}\n\nYou've been carrying a lot.`)).toBe("You've been carrying a lot.");
  });

  it("removes an already-DOUBLED preface (the bug observed on later turns)", () => {
    expect(stripLeadingPreface(`${ZH}\n\n${ZH}\n\n剩下的内容。`)).toBe("剩下的内容。");
  });

  it("leaves a normal reply (no preface) untouched apart from leading whitespace", () => {
    expect(stripLeadingPreface("我理解你的感受，我们慢慢聊。")).toBe("我理解你的感受，我们慢慢聊。");
  });

  it("does not strip a preface that appears mid-message (only leading)", () => {
    const mid = `我想先说一句：${ZH}`;
    expect(stripLeadingPreface(mid)).toBe(mid);
  });

  it("handles a preface-only message without crashing", () => {
    expect(stripLeadingPreface(`${ZH}`)).toBe("");
  });
});
