import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { assessImplicitRiskWithLLM } from "@/lib/implicit-risk";
import { generateDeepSeekText } from "@/lib/deepseek";
import { retrieveKnowledge } from "@/lib/knowledge";
import { searchAuthoritative } from "@/lib/web-search";

// Spy on retrieval + web-search so we can PROVE the safety guards: a crisis turn must
// never call them, and web fallback is reached only on a cleared, KB-miss, deep turn.
// isInfoSeeking stays REAL (the route's gate) — only the network-touching fns are stubbed.
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

// The danger judge (Kimi) needs an API key, so it cannot run in unit tests. Mock it
// to prove the reorder deterministically — when the JUDGE flags danger it must win
// over a brittle medication-keyword match. Default = not_configured, so every other
// (lexicon-only) test behaves exactly like production-without-a-key.
vi.mock("@/lib/implicit-risk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/implicit-risk")>();
  return {
    ...actual,
    assessImplicitRiskWithLLM: vi.fn(async () => ({ kind: "not_configured" as const }))
  };
});
const mockedJudge = vi.mocked(assessImplicitRiskWithLLM);

// No DEEPSEEK key in unit tests → a crisis reply can't be model-generated. Default to
// throwing so respondTailoredCrisis falls back to the vetted fixed template
// (deterministic, env-independent). One test overrides it to exercise the AI path.
vi.mock("@/lib/deepseek", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/deepseek")>();
  return {
    ...actual,
    generateDeepSeekText: vi.fn(async () => {
      throw new Error("no DEEPSEEK key in tests");
    })
  };
});
const mockedGen = vi.mocked(generateDeepSeekText);

/**
 * Branch-order regression tests for the chat route.
 *
 * The route decides WHICH safety template a user receives via an ordered
 * sequence of branches (crisis → suicide_concern → medication → diagnosis →
 * medical_red_flag → implicit LLM → normal). This ordering is safety-critical:
 * a future reorder that put medication_request ahead of suicide_concern would
 * silently route a suicidal user to a calm "I can't recommend doses" reply.
 *
 * These cases all trigger LEXICON branches that return BEFORE the implicit-LLM
 * call, so they are deterministic and need no API keys / network.
 */
function chatRequest(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, language: "zh" })
  });
}

async function bodyText(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const res = await POST(chatRequest(messages));
  return res.text();
}

describe("chat route — safety branch ordering", () => {
  it("explicit crisis returns the crisis template", async () => {
    const text = await bodyText([{ role: "user", content: "我想跳楼，活不下去了。" }]);
    expect(text).toContain("危险信号");
    expect(text).toContain("急救");
  });

  it("overdose disclosure (P0 fix) routes to CRISIS, not medication boundary", async () => {
    // Lexicon alone matched only "安眠药" → medication. The danger judge recognizes the
    // overdose; the reorder runs the judge BEFORE the medication branch so danger wins.
    // (Judge needs a Kimi key in prod; mocked here to a post-attempt disclosure.)
    mockedJudge.mockResolvedValueOnce({
      kind: "ok",
      result: {
        severity: "post_attempt_disclosure",
        pragmatic: "self",
        modifiers: ["means_capability"],
        evidence: ["把整瓶安眠药都吞了"],
        confidence: 0.95,
        suggestedFlags: [],
        rationale: "explicit overdose disclosure"
      }
    });
    const text = await bodyText([{ role: "user", content: "我刚刚把整瓶安眠药都吞了。" }]);
    expect(text).toContain("危险信号");
    expect(text).not.toContain("不能给你推荐药名、剂量");
  });

  it("subtle ideation returns the suicide-concern template", async () => {
    const text = await bodyText([{ role: "user", content: "如果我不在了，大家应该会轻松一点。" }]);
    expect(text).toContain("认真对待");
  });

  it("CRITICAL ordering: ideation + medication in one message → suicide-concern wins, not medication", async () => {
    const text = await bodyText([
      { role: "user", content: "如果我不在了大家会轻松一点……我该吃什么药、剂量多少？" }
    ]);
    // suicide_concern branch must take precedence over medication_request
    expect(text).toContain("认真对待");
    expect(text).not.toContain("不能给你推荐药名、剂量");
  });

  it("eval #1 fix: ordinary distress idiom the JUDGE clears → warm gentle check, NOT the grading block", async () => {
    // "快撑不住了" matches the lexicon suicide_concern list, but here it's an ordinary
    // work-stress vent. With a real judge reading it as everyday distress, the route
    // must soften to the gentle check instead of the cold number-grading template.
    mockedJudge.mockResolvedValueOnce({
      kind: "ok",
      result: {
        severity: "none",
        pragmatic: "self",
        modifiers: [],
        evidence: [],
        confidence: 0.9,
        suggestedFlags: [],
        rationale: "ordinary work stress, no death/means/farewell framing"
      }
    });
    const text = await bodyText([{ role: "user", content: "我最近工作压力好大，天天加班，快撑不住了。" }]);
    expect(text).toContain("想停下来休息一下"); // the gentle check
    expect(text).not.toContain("认真对待"); // NOT the suicide-concern grading template
  });

  it("eval #1 fix preserves the FAIL-SAFE: same idiom but judge unavailable → still fires the template", async () => {
    // Default judge mock = not_configured (a Kimi outage / no key). A lexicon suicide
    // signal must NEVER be silently released when the judge can't weigh in.
    const text = await bodyText([{ role: "user", content: "我最近工作压力好大，天天加班，快撑不住了。" }]);
    expect(text).toContain("认真对待"); // the suicide-concern template still fires
  });

  it("judge passive_death_wish + a cue at LOW confidence (lexicon clean) → warm gentle check, NOT the grading block", async () => {
    // The 2026-06-25 report: the intentionally-aggressive judge over-triaged soft
    // distress into the full number-grading. With a clean lexicon, no hard modifier and
    // only low confidence, the route now softens to the warm gentle check.
    mockedJudge.mockResolvedValueOnce({
      kind: "ok",
      result: {
        severity: "passive_death_wish",
        pragmatic: "self",
        modifiers: [],
        evidence: ["一切都没什么意义了"],
        confidence: 0.5,
        suggestedFlags: [],
        rationale: "low-confidence passive death wish"
      }
    });
    const text = await bodyText([{ role: "user", content: "我好伤心" }]);
    expect(text).toContain("想停下来休息一下"); // gentle check
    expect(text).not.toContain("认真对待"); // NOT the suicide-concern grading template
  });

  it("judge passive_death_wish WITH a means modifier → full template even on a clean lexicon (real implicit risk kept)", async () => {
    mockedJudge.mockResolvedValueOnce({
      kind: "ok",
      result: {
        severity: "passive_death_wish",
        pragmatic: "self",
        modifiers: ["means_capability"],
        evidence: [],
        confidence: 0.7,
        suggestedFlags: [],
        rationale: "implicit ideation with means cue the lexicon missed"
      }
    });
    // Same benign-looking input as the soften test — ONLY the judge's means modifier
    // differs — and that alone keeps the full template (real implicit risk not dropped).
    const text = await bodyText([{ role: "user", content: "我好伤心" }]);
    expect(text).toContain("认真对待"); // full suicide-concern template, NOT softened
  });

  it("plain medication request returns the medication-boundary template", async () => {
    const text = await bodyText([{ role: "user", content: "你推荐我吃什么药？剂量多少？" }]);
    expect(text).toContain("不能给你推荐药名、剂量");
  });

  it("diagnosis request returns the diagnosis-boundary template", async () => {
    const text = await bodyText([{ role: "user", content: "你帮我诊断一下我是不是抑郁症？" }]);
    expect(text).toContain("不能在聊天里替你诊断");
  });

  it("medical red flag (P0 colloquial fix) routes to medical-first, not psychologized", async () => {
    // Colloquial body emergency the lexicon misses ("胸口剧痛" ≠ "胸口痛"). The judge
    // recognizes it and suggests medical_red_flag; merge adds it (pragmatic=self) →
    // the post-judge medical branch routes medical-first. (Judge needs a key in prod.)
    mockedJudge.mockResolvedValueOnce({
      kind: "ok",
      result: {
        severity: "none",
        pragmatic: "self",
        modifiers: [],
        evidence: ["胸口剧痛，喘不上气"],
        confidence: 0.8,
        suggestedFlags: ["medical_red_flag"],
        rationale: "suspected acute cardiac/neuro emergency"
      }
    });
    const text = await bodyText([{ role: "user", content: "我突然胸口剧痛，喘不上气，话也说不清。" }]);
    expect(text).toContain("先把身体风险放在前面");
  });

  // v2: once in an active crisis session, a triggering follow-up must NOT re-dump
  // the identical static template (robotic / re-traumatizing). It should fall
  // through to the contextual model path while the crisis banner stays up so the
  // real hotlines remain one tap away (deterministic floor).
  it("does NOT re-dump the suicide-concern template on a follow-up while already in crisis", async () => {
    const res = await POST(
      chatRequest([
        { role: "user", content: "如果我不在了，大家应该会轻松一点。" },
        { role: "assistant", content: "这句话我会认真对待。……（先前已发过的危机回复）" },
        { role: "user", content: "我还是觉得活着没意思。" }
      ])
    );
    const text = await res.text();
    expect(text).not.toContain("这句话我会认真对待"); // template not repeated verbatim
    expect(res.headers.get("X-Crisis-Triggered")).toBe("1"); // banner persists → resources reachable
  });

  it("first-contact suicide concern still DOES return the template (engage only kicks in on follow-ups)", async () => {
    // No key in tests → respondTailoredCrisis falls back to the fixed template, so the
    // template text is what's asserted here. (With a key, prod sends an AI-tailored reply.)
    const text = await bodyText([{ role: "user", content: "如果我不在了，大家应该会轻松一点。" }]);
    expect(text).toContain("这句话我会认真对待");
  });

  it("③ first-contact crisis is AI-tailored; the deterministic floor is the crisis headers (banner), not in-text hotlines", async () => {
    // 2026-07-08 owner directive: the appended in-text resource block is removed.
    // The GUARANTEED floor is now X-Crisis-Triggered/X-Crisis-Mode → the client
    // renders the crisis banner with tappable hotlines + the 1–4 buttons.
    mockedGen.mockResolvedValueOnce("我在这里，你刚说的那种撑不住，我听见了。");
    const res = await POST(chatRequest([{ role: "user", content: "我想跳楼，活不下去了。" }]));
    const text = await res.text();
    expect(text).toContain("我在这里");            // tailored AI words, not a fixed template
    expect(text).not.toContain("12356");           // no in-text hotline block anymore
    expect(text).not.toContain("无论如何，这些随时可用");
    expect(res.headers.get("X-Crisis-Triggered")).toBe("1");
    expect(res.headers.get("X-Crisis-Mode")).toBe("crisis"); // deterministic banner floor
  });
});

describe("chat route — RAG safety guards (P5)", () => {
  beforeEach(() => {
    mockedRetrieve.mockClear();
    mockedSearch.mockClear();
  });

  function requestWith(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    pace: "fast" | "deep"
  ) {
    return new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, language: "zh", pace })
    });
  }

  it("safety guard ①: a crisis turn NEVER calls retrieval or web search", async () => {
    // Crisis returns at the deterministic floor, above the retrieval/web-search wiring, so
    // embed/Qdrant/Tavily are never reached for a vulnerable user.
    await bodyText([{ role: "user", content: "我想跳楼，活不下去了。" }]);
    expect(mockedRetrieve).not.toHaveBeenCalled();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("crisis in DEEP mode is still never web-searched", async () => {
    const res = await POST(requestWith([{ role: "user", content: "我不想活了，想结束这一切。" }], "deep"));
    await res.text();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("non-crisis, info-seeking, deep, KB miss → web fallback IS reached (enhancement kept)", async () => {
    mockedRetrieve.mockResolvedValueOnce([]); // KB miss
    const res = await POST(requestWith([{ role: "user", content: "怎么缓解焦虑呢？" }], "deep"));
    await res.text();
    expect(mockedRetrieve).toHaveBeenCalled();
    expect(mockedSearch).toHaveBeenCalled();
  });

  it("safety guard ①b: an ACTIVE crisis session does NOT call retrieval even on an info-seeking turn", async () => {
    // crisisModeActive is set → a benign info-seeking follow-up ('该怎么办' is an INFO
    // marker) must NOT pull grounded psychoeducation mid-crisis (symmetric with the
    // web-search !crisisModeActive guard). Without the gate, retrieveKnowledge would fire.
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "失眠了我该怎么办？" }],
        language: "zh",
        pace: "deep",
        crisisModeActive: true
      })
    });
    await (await POST(req)).text();
    expect(mockedRetrieve).not.toHaveBeenCalled();
    expect(mockedSearch).not.toHaveBeenCalled();
  });
});
