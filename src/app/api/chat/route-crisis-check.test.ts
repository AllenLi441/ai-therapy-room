import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { assessImplicitRiskWithLLM } from "@/lib/implicit-risk";
import { generateDeepSeekText } from "@/lib/deepseek";
import { retrieveKnowledge } from "@/lib/knowledge";
import { searchAuthoritative } from "@/lib/web-search";
import { createSuicideConcernResponse } from "@/lib/safety";

// Same mock shape as route.test.ts — see that file's comments for rationale.
vi.mock("@/lib/knowledge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/knowledge")>();
  return { ...actual, retrieveKnowledge: vi.fn(async () => []) };
});
vi.mock("@/lib/web-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/web-search")>();
  return { ...actual, searchAuthoritative: vi.fn(async () => []) };
});
const mockedRetrieve = vi.mocked(retrieveKnowledge);
const mockedSearch = vi.mocked(searchAuthoritative);

vi.mock("@/lib/implicit-risk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/implicit-risk")>();
  return {
    ...actual,
    assessImplicitRiskWithLLM: vi.fn(async () => ({ kind: "not_configured" as const }))
  };
});
const mockedJudge = vi.mocked(assessImplicitRiskWithLLM);

vi.mock("@/lib/deepseek", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/deepseek")>();
  return {
    ...actual,
    generateDeepSeekText: vi.fn(async () => {
      throw new Error("no DEEPSEEK key in tests");
    })
  };
});

function chatRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "zh", ...body })
  });
}

const suicideConcernPromptZh = createSuicideConcernResponse("zh");

// The history the spec scenarios share: a first-contact suicide-concern turn followed
// by the AI's (fixed-template, since no DEEPSEEK key in tests) suicide-concern reply,
// which is what puts the session into crisisModeActive via detectActiveCrisisFromHistory.
function crisisHistory(lastUserReply: string) {
  return [
    { role: "user" as const, content: "如果我不在了，大家应该会轻松一点。" },
    { role: "assistant" as const, content: suicideConcernPromptZh },
    { role: "user" as const, content: lastUserReply }
  ];
}

describe("chat route — crisis 1–4 check-reply closure (task B)", () => {
  it("scenario 1: '3' on the severity scale → deterministic escalate reply + X-Crisis-Source header", async () => {
    const res = await POST(chatRequest({ messages: crisisHistory("3") }));
    const text = await res.text();
    expect(text).toContain("现在最重要的事不是继续聊");
    expect(res.headers.get("X-Crisis-Source")).toBe("check_reply_escalate");
  });

  it("scenario 2: '1' on the severity scale → deterministic stabilize reply", async () => {
    const res = await POST(chatRequest({ messages: crisisHistory("1") }));
    const text = await res.text();
    expect(text).toContain("这一步很重要");
    expect(res.headers.get("X-Crisis-Source")).toBe("check_reply_stabilize");
  });

  it("scenario 3: a long reply that merely starts with '3' does NOT trigger the number branch", async () => {
    const long = "3，不过其实我想了很多事情，今天发生了太多，一时不知道从哪里说起才好呢，脑子里乱糟糟的说不清楚";
    expect(long.length).toBeGreaterThan(40);
    const res = await POST(chatRequest({ messages: crisisHistory(long) }));
    const text = await res.text();
    expect(text).not.toContain("现在最重要的事不是继续聊");
    expect(text).not.toContain("这一步很重要");
  });

  it("scenario 4: no crisis history, crisisModeActive not set, '3' → normal path (not triggered)", async () => {
    const res = await POST(chatRequest({ messages: [{ role: "user", content: "3" }] }));
    const text = await res.text();
    expect(text).not.toContain("现在最重要的事不是继续聊");
    expect(text).not.toContain("这一步很重要");
    expect(res.headers.get("X-Crisis-Source")).not.toBe("check_reply_escalate");
    expect(res.headers.get("X-Crisis-Source")).not.toBe("check_reply_stabilize");
  });

  // 2026-07-05 (product owner directive, D1/D4): the resource block no longer asks
  // "reply with one number" in text — that question now lives in the crisis banner's
  // 1–4 buttons, which send a bare digit through the normal chat path. This scenario
  // proves that button path still closes the loop: a PLAIN crisis-adjacent assistant
  // reply (no question anywhere in its text) + crisisModeActive + a bare "4" from the
  // user still resolves to the deterministic escalate reply via classifyCrisisCheckReply's
  // assumeAsked (route.ts D3), not by matching text the resource block no longer sends.
  it("scenario 5 (D4 button path): a plain crisis reply with NO question in the text + crisisModeActive + user '4' → escalate + check_reply_escalate header", async () => {
    const history = [
      { role: "user" as const, content: "我现在很难受" },
      { role: "assistant" as const, content: "我听见你现在很不好受，我们先一起把注意力放在呼吸上，慢慢来。" },
      { role: "user" as const, content: "4" }
    ];
    expect(history[1].content).not.toContain("一个数字");
    expect(history[1].content.toLowerCase()).not.toContain("one number");
    const res = await POST(chatRequest({ messages: history, crisisModeActive: true }));
    const text = await res.text();
    expect(text).toContain("现在最重要的事不是继续聊");
    expect(res.headers.get("X-Crisis-Source")).toBe("check_reply_escalate");
  });
});

describe("chat route — fast-mode soft-cue front gate (task C)", () => {
  it("pace=fast + a single implicit-suspicious phrase + judge clears it → blocking flow (no X-Safety: parallel)", async () => {
    mockedJudge.mockResolvedValueOnce({
      kind: "ok",
      result: {
        severity: "none",
        pragmatic: "self",
        modifiers: [],
        evidence: [],
        confidence: 0.9,
        suggestedFlags: [],
        rationale: "cleared by judge"
      }
    });
    const res = await POST(
      chatRequest({ messages: [{ role: "user", content: "最近把朋友圈关了" }], pace: "fast" })
    );
    await res.text();
    expect(res.headers.get("X-Safety")).not.toBe("parallel");
  });
});

describe("chat route — input-length guardrail (task E)", () => {
  it("a message over 4000 chars is rejected with 413 and a gentle plain-text body", async () => {
    const tooLong = "啊".repeat(4001);
    const res = await POST(chatRequest({ messages: [{ role: "user", content: tooLong }] }));
    expect(res.status).toBe(413);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("这段有点长");
  });
});
