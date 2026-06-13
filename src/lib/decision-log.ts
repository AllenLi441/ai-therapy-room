import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { RiskAssessment } from "./types";
import type { ImplicitOutcome, ImplicitDecision } from "./implicit-risk";

/**
 * Decision log — append-only JSONL of every risk decision the chat route makes.
 *
 * Used downstream by:
 *   - scripts/find-fp-fn.mjs to harvest false-positive / false-negative
 *     candidates for the W1 annotation queue.
 *   - manual audits when something goes wrong in production.
 *
 * Privacy posture:
 *   - We hash a stable session token (not stored, just derived from a salt)
 *     so we can group decisions from the same conversation without storing
 *     anything that ties back to a user.
 *   - By DEFAULT we persist only structured decision metadata (risk level,
 *     flags, categories, matched lexicon terms, severity, route). Free-form
 *     user content — the raw message, the recent-turns digest, the LLM
 *     evidence quotes, and the quote-bearing rationale — is NOT written to
 *     disk. This is what README's "不长期保存用户聊天内容" promise requires.
 *   - Set QUIET_ROOM_DECISION_LOG_RAW=1 to additionally persist that raw
 *     content for the W1 research pipeline. It is opt-in and MUST only be
 *     enabled under the project's data-handling agreement.
 *   - Logs auto-rotate by date so retention can be a simple `find ... -mtime +N -delete`.
 */

export type DecisionRoute =
  | "lexicon_crisis"
  | "lexicon_suicide_concern"
  | "lexicon_medication"
  | "lexicon_diagnosis"
  | "lexicon_medical_red_flag"
  | "implicit_crisis"
  | "implicit_suicide_concern"
  | "implicit_gentle_check"
  | "implicit_fail_safe"
  | "deepseek_normal";

export type DecisionLogEntry = {
  ts: string;
  sessionHash: string;
  turnIndex: number;
  /** Last user message (the one the decision was made on), truncated. */
  userMessage: string;
  /** Last 4 user messages concatenated (cumulative-view input), truncated. */
  conversationDigest: string;
  lexicon: {
    level: RiskAssessment["level"];
    flags: RiskAssessment["flags"];
    categories: RiskAssessment["categories"];
    matchedTerms: string[];
    rationale: string;
  };
  implicit:
    | { kind: "ok"; level: string; severity: string; pragmatic: string; modifiers: string[]; confidence: number; evidence: string[] }
    | { kind: "not_configured" }
    | { kind: "error"; reason: string };
  implicitDecision: ImplicitDecision;
  crisisModeActive: boolean;
  route: DecisionRoute;
};

const SESSION_SALT = process.env.QUIET_ROOM_SESSION_SALT ?? "static-fallback-salt-rotate-in-prod";

/** Stable per-conversation hash without storing any identifier. */
export function deriveSessionHash(messagesSnapshot: string): string {
  const h = crypto.createHash("sha256");
  h.update(SESSION_SALT);
  h.update("|");
  h.update(messagesSnapshot.slice(0, 256));
  return h.digest("hex").slice(0, 16);
}

function isoDate() {
  return new Date().toISOString();
}

function dayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function logsDir() {
  return path.join(process.cwd(), "logs");
}

function logPath() {
  return path.join(logsDir(), `decisions-${dayStamp()}.jsonl`);
}

let warned = false;

export async function appendDecisionLog(entry: Omit<DecisionLogEntry, "ts">) {
  if (process.env.QUIET_ROOM_DECISION_LOG_DISABLED === "1") return;

  const full: DecisionLogEntry = { ts: isoDate(), ...entry };
  try {
    await fs.mkdir(logsDir(), { recursive: true });
    await fs.appendFile(logPath(), JSON.stringify(full) + "\n", "utf-8");
  } catch (err) {
    if (!warned) {
      warned = true;
      const reason = err instanceof Error ? err.message : "unknown";
      console.warn(`[decision-log] disabled after first failure: ${reason}`);
    }
  }
}

/** Helper to construct the entry from the chat route's intermediate values. */
export function buildDecisionLogEntry(input: {
  messages: { role: string; content: string }[];
  lexicon: RiskAssessment;
  implicit: ImplicitOutcome;
  implicitDecision: ImplicitDecision;
  crisisModeActive: boolean;
  route: DecisionRoute;
  turnIndex?: number;
}): Omit<DecisionLogEntry, "ts"> {
  // Default posture: do NOT persist free-form user chat content. Only opt in
  // (under the data-handling agreement) via QUIET_ROOM_DECISION_LOG_RAW=1.
  const persistRaw = process.env.QUIET_ROOM_DECISION_LOG_RAW === "1";

  const userTurns = input.messages.filter((m) => m.role === "user");
  const last = userTurns[userTurns.length - 1]?.content ?? "";
  const recent = userTurns.slice(-4).map((m) => m.content).join(" | ");

  const sessionHash = deriveSessionHash(
    input.messages.slice(0, 3).map((m) => `${m.role}:${m.content.slice(0, 80)}`).join("\n")
  );

  const implicit =
    input.implicit.kind === "ok"
      ? {
          kind: "ok" as const,
          level: input.implicit.result.severity, // C-SSRS-ish severity
          severity: input.implicit.result.severity,
          pragmatic: input.implicit.result.pragmatic,
          modifiers: input.implicit.result.modifiers,
          confidence: input.implicit.result.confidence,
          // evidence holds verbatim user quotes (see implicit-risk.ts) — redact unless opted in.
          evidence: persistRaw ? input.implicit.result.evidence : []
        }
      : input.implicit.kind === "not_configured"
        ? { kind: "not_configured" as const }
        : { kind: "error" as const, reason: input.implicit.reason };

  return {
    sessionHash,
    turnIndex: input.turnIndex ?? userTurns.length,
    userMessage: persistRaw ? last.slice(0, 600) : "",
    conversationDigest: persistRaw ? recent.slice(0, 1600) : "",
    lexicon: {
      level: input.lexicon.level,
      flags: input.lexicon.flags,
      categories: input.lexicon.categories,
      // matchedTerms are bounded lexicon vocabulary (classifier metadata), kept for audit.
      matchedTerms: input.lexicon.matchedTerms.slice(0, 10),
      // rationale embeds the 证据：「...」 quote clause (see implicit-risk.ts) — redact unless opted in.
      rationale: persistRaw ? input.lexicon.rationale : ""
    },
    implicit,
    implicitDecision: input.implicitDecision,
    crisisModeActive: input.crisisModeActive,
    route: input.route
  };
}
