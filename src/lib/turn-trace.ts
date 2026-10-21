import type { ImplicitDecision, ImplicitOutcome } from "./implicit-risk";
import type { PragmaticForm, RiskSeverity } from "./types";

/** Every route the chat endpoint can take; the decision log and the turn trace share it. */
export const DECISION_ROUTES = [
  "lexicon_crisis",
  "lexicon_suicide_concern",
  "lexicon_medication",
  "lexicon_diagnosis",
  "lexicon_medical_red_flag",
  "implicit_crisis",
  "implicit_suicide_concern",
  "implicit_gentle_check",
  "implicit_fail_safe",
  "deepseek_normal",
  "crisis_check_reply",
] as const;
export type DecisionRoute = (typeof DECISION_ROUTES)[number];

const SEVERITIES: RiskSeverity[] = ["none", "passive_death_wish", "suicidal_ideation", "plan_preparation", "imminent_acute", "post_attempt_disclosure", "non_suicidal_self_harm"];
const PRAGMATICS: PragmaticForm[] = ["self", "other", "quote_fictional", "sarcasm_hyperbole", "rhetorical_complaint", "emoji_coded", "coded_euphemism", "uncertain_ambivalent"];
const DECISION_MODES = ["crisis", "suicide_concern", "gentle_check"] as const;
const MODELS = ["deepseek-v4-pro", "deepseek-flash"];
const THINKING = ["off", "low", "high", "max"] as const;

/**
 * How one assistant reply was produced, for the consented training dataset. Sent to the
 * browser in the X-Turn header (and in fast mode's trailing safety event, once the judge
 * has answered), kept on the message and uploaded with the conversation. Structured
 * labels only: no judge rationale or evidence spans, which quote the user.
 */
export type TurnTrace = {
  v: 1;
  app: string;
  route: DecisionRoute;
  pace: "deep" | "fast";
  /** The API model that wrote the reply; absent when the reply is a fixed text. */
  model?: string;
  thinking?: (typeof THINKING)[number];
  mode?: "information" | "support";
  /** Knowledge card ids and `web:<domain>` for live results that were in the prompt. */
  refs?: string[];
  judge?: { kind: ImplicitOutcome["kind"]; severity?: RiskSeverity; pragmatic?: PragmaticForm; confidence?: number; by?: "kimi" | "deepseek" };
  decision?: { intercept: boolean; mode?: (typeof DECISION_MODES)[number]; source: string };
  ms?: { judge?: number; evidence?: number };
  /** Written inside an active crisis session (crisis-safety prompt), not an ordinary reply. */
  crisis?: true;
  /** The output guard withdrew the model's reply and showed a fixed text instead. */
  guard?: "means" | "medication" | "diagnosis" | "romance";
};

const CRISIS_ROUTES: DecisionRoute[] = ["lexicon_crisis", "lexicon_suicide_concern", "implicit_crisis", "implicit_suicide_concern", "implicit_fail_safe", "crisis_check_reply"];

/** Whether a reply belongs to a crisis or suicide-concern intervention. The crisis replies
 * themselves send no safety event (only X-Crisis-* headers), so `safety` alone misses them. */
export function isCrisisMessage(message: { safety?: string; meta?: TurnTrace }): boolean {
  const meta = message.meta;
  return message.safety === "crisis" || message.safety === "suicide_concern" || !!meta?.crisis ||
    (!!meta && CRISIS_ROUTES.includes(meta.route)) ||
    meta?.decision?.mode === "crisis" || meta?.decision?.mode === "suicide_concern";
}

export function judgeTrace(outcome: ImplicitOutcome, decision: ImplicitDecision): Pick<TurnTrace, "judge" | "decision"> {
  const result = outcome.kind === "ok" ? outcome.result : null;
  return {
    judge: result
      ? { kind: "ok", severity: result.severity, pragmatic: result.pragmatic, confidence: result.confidence, ...(result.judgedBy ? { by: result.judgedBy } : {}) }
      : { kind: outcome.kind },
    decision: decision.intercept
      ? { intercept: true, mode: decision.mode, source: decision.source }
      : { intercept: false, source: decision.source },
  };
}

export function encodeTurnTrace(trace: TurnTrace): string {
  return encodeURIComponent(JSON.stringify(trace));
}

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const oneOf = <T extends string>(list: readonly T[], x: unknown): T | undefined => list.includes(x as T) ? x as T : undefined;
const ms = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(Math.round(x), 120_000) : undefined;
const REF = /^(?:web:)?[\w.-]{1,120}$/;

/** Rebuilds a trace from untrusted input (browser storage, an upload): known fields and
 * values only, anything else dropped. Returns undefined when the core fields are invalid. */
export function parseTurnTrace(value: unknown): TurnTrace | undefined {
  if (!object(value) || value.v !== 1 || typeof value.app !== "string" || !/^\d+\.\d+\.\d+$/.test(value.app)) return undefined;
  const route = oneOf(DECISION_ROUTES, value.route);
  const pace = oneOf(["deep", "fast"] as const, value.pace);
  if (!route || !pace) return undefined;
  const trace: TurnTrace = { v: 1, app: value.app, route, pace };
  const model = oneOf(MODELS, value.model);
  if (model) trace.model = model;
  const thinking = oneOf(THINKING, value.thinking);
  if (thinking) trace.thinking = thinking;
  const mode = oneOf(["information", "support"] as const, value.mode);
  if (mode) trace.mode = mode;
  if (Array.isArray(value.refs)) {
    const refs = value.refs.filter((ref): ref is string => typeof ref === "string" && REF.test(ref)).slice(0, 8);
    if (refs.length) trace.refs = refs;
  }
  if (object(value.judge)) {
    const kind = oneOf(["ok", "not_configured", "error"] as const, value.judge.kind);
    if (kind) {
      const { severity, pragmatic, confidence, by } = value.judge;
      trace.judge = {
        kind,
        ...(oneOf(SEVERITIES, severity) ? { severity: severity as RiskSeverity } : {}),
        ...(oneOf(PRAGMATICS, pragmatic) ? { pragmatic: pragmatic as PragmaticForm } : {}),
        ...(typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? { confidence } : {}),
        ...(by === "kimi" || by === "deepseek" ? { by } : {}),
      };
    }
  }
  if (object(value.decision) && typeof value.decision.intercept === "boolean" && typeof value.decision.source === "string" && /^[a-z_]{1,40}$/.test(value.decision.source)) {
    const decisionMode = oneOf(DECISION_MODES, value.decision.mode);
    trace.decision = { intercept: value.decision.intercept, source: value.decision.source, ...(decisionMode ? { mode: decisionMode } : {}) };
  }
  if (object(value.ms)) {
    const judge = ms(value.ms.judge), evidence = ms(value.ms.evidence);
    if (judge !== undefined || evidence !== undefined) trace.ms = { ...(judge !== undefined ? { judge } : {}), ...(evidence !== undefined ? { evidence } : {}) };
  }
  if (value.crisis === true) trace.crisis = true;
  const guard = oneOf(["means", "medication", "diagnosis", "romance"] as const, value.guard);
  if (guard) trace.guard = guard;
  return trace;
}

/** A reply the user replaced with "换个说法": a rejected sample for preference data. */
export type ReplyAlternative = { content: string; meta?: TurnTrace; feedback?: "up" | "down" };
export const MAX_ALTERNATIVES = 3;

export function parseReplyAlternatives(value: unknown): ReplyAlternative[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.slice(-20).flatMap((row): ReplyAlternative[] => {
    if (!object(row) || typeof row.content !== "string" || !row.content.trim()) return [];
    const meta = parseTurnTrace(row.meta);
    return [{
      content: row.content.slice(0, 12000),
      ...(meta ? { meta } : {}),
      ...(row.feedback === "up" || row.feedback === "down" ? { feedback: row.feedback } : {}),
    }];
  }).slice(-MAX_ALTERNATIVES);
  return list.length ? list : undefined;
}

/** Reads the X-Turn header; a missing or malformed header is simply no trace. */
export function readTurnTraceHeader(value: string | null): TurnTrace | undefined {
  if (!value || value.length > 4000) return undefined;
  try {
    return parseTurnTrace(JSON.parse(decodeURIComponent(value)));
  } catch {
    return undefined;
  }
}
