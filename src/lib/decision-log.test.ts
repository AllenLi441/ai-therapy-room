import { afterEach, describe, expect, it } from "vitest";
import { buildDecisionLogEntry } from "./decision-log";
import type { ImplicitOutcome, ImplicitDecision } from "./implicit-risk";
import type { RiskAssessment } from "./types";

const RAW_LAST = "我昨晚又把药盒拿出来数了一遍，真的撑不下去了";
const RAW_PREV = "最近一直睡不着，脑子里全是不想活了的念头";

const lexicon: RiskAssessment = {
  level: "high",
  categories: ["suicide"],
  matchedTerms: ["不想活了", "撑不下去"],
  flags: ["suicide_concern"],
  shouldEscalate: true,
  // In production this rationale embeds a 证据：「...」 clause of verbatim quotes.
  rationale: "匹配到自杀相关词汇。 语义判断：severity=suicidal_ideation。 证据：「真的撑不下去了」"
};

const implicitOk: ImplicitOutcome = {
  kind: "ok",
  result: {
    severity: "suicidal_ideation",
    pragmatic: "self",
    modifiers: [],
    evidence: ["真的撑不下去了", "不想活了的念头"],
    confidence: 0.8,
    suggestedFlags: ["suicide_concern"],
    rationale: "用户表达持续的自杀意念"
  }
};

const decision: ImplicitDecision = {
  intercept: true,
  mode: "suicide_concern",
  source: "llm",
  rationale: "severity=suicidal_ideation"
};

function build() {
  return buildDecisionLogEntry({
    messages: [
      { role: "user", content: RAW_PREV },
      { role: "assistant", content: "我在听。" },
      { role: "user", content: RAW_LAST }
    ],
    lexicon,
    implicit: implicitOk,
    implicitDecision: decision,
    crisisModeActive: false,
    route: "lexicon_suicide_concern"
  });
}

describe("decision-log privacy redaction", () => {
  const original = process.env.QUIET_ROOM_DECISION_LOG_RAW;
  afterEach(() => {
    if (original === undefined) delete process.env.QUIET_ROOM_DECISION_LOG_RAW;
    else process.env.QUIET_ROOM_DECISION_LOG_RAW = original;
  });

  it("by default stores NO free-form user content", () => {
    delete process.env.QUIET_ROOM_DECISION_LOG_RAW;
    const entry = build();

    // Raw chat content must not be persisted.
    expect(entry.userMessage).toBe("");
    expect(entry.conversationDigest).toBe("");
    expect(entry.lexicon.rationale).toBe("");
    expect(entry.implicit).toMatchObject({ kind: "ok" });
    if (entry.implicit.kind === "ok") expect(entry.implicit.evidence).toEqual([]);

    // Belt-and-suspenders: the verbatim strings must appear nowhere in the entry.
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(RAW_LAST);
    expect(serialized).not.toContain(RAW_PREV);
    expect(serialized).not.toContain("真的撑不下去了");

    // Structured decision metadata IS retained (needed for audit + W1 harvest).
    expect(entry.lexicon.level).toBe("high");
    expect(entry.lexicon.flags).toEqual(["suicide_concern"]);
    expect(entry.lexicon.matchedTerms).toEqual(["不想活了", "撑不下去"]);
    expect(entry.route).toBe("lexicon_suicide_concern");
    expect(entry.sessionHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("persists raw content only when explicitly opted in", () => {
    process.env.QUIET_ROOM_DECISION_LOG_RAW = "1";
    const entry = build();

    expect(entry.userMessage).toBe(RAW_LAST);
    expect(entry.conversationDigest).toContain(RAW_PREV);
    expect(entry.conversationDigest).toContain(RAW_LAST);
    expect(entry.lexicon.rationale).toContain("证据：");
    if (entry.implicit.kind === "ok") {
      expect(entry.implicit.evidence).toEqual(["真的撑不下去了", "不想活了的念头"]);
    }
  });

  it("truncates raw fields to the documented caps when opted in", () => {
    process.env.QUIET_ROOM_DECISION_LOG_RAW = "1";
    const longMsg = "啊".repeat(900);
    const entry = buildDecisionLogEntry({
      messages: [{ role: "user", content: longMsg }],
      lexicon,
      implicit: { kind: "not_configured" },
      implicitDecision: { intercept: false, source: "none", rationale: "n/a" },
      crisisModeActive: false,
      route: "deepseek_normal"
    });
    expect(entry.userMessage.length).toBe(600);
    expect(entry.conversationDigest.length).toBeLessThanOrEqual(1600);
  });
});
