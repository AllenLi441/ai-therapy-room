import type { AgeRange, Lang, Message, SupportRegion } from "./data";
import type { CaseMap, ScaleResult } from "@/lib/types";
import { normalizeSupportRegion } from "@/lib/support-regions";

export const CONSENT_VERSION = "2";
export const STORAGE_KEYS = ["js_chat", "js_scales", "js_case", "js_case_edited", "js_consent", "js_feedback", "js_sessions", "js_active_session", "js_continuation", "js_age_range", "js_support_region", "js_draft"] as const;

export type SessionRecord = {
  id: string;
  createdAt: string;
  summary: string;
  nextStep: string;
  messages: Message[];
  scaleResults: ScaleResult[];
  caseMap: CaseMap | null;
};
export type RecordBackup = {
  format: "jingshi-records";
  version: 1;
  exportedAt: string;
  messages: Message[];
  scaleResults: ScaleResult[];
  caseMap: CaseMap | null;
  sessions: SessionRecord[];
  settings: { lang: Lang; theme: string; supportRegion: SupportRegion; ageRange: AgeRange };
};

/** All state-changing operations invalidate late network responses together. */
export class RequestScope {
  private generation = 0;
  private controllers = new Set<AbortController>();
  start() {
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.add(controller);
    return {
      signal: controller.signal,
      current: () => generation === this.generation,
      abort: () => controller.abort(),
      release: () => this.controllers.delete(controller),
    };
  }
  invalidate() {
    this.generation += 1;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown, limit = 12000) => typeof x === "string" ? x.slice(0, limit) : "";

export function readMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(-120).flatMap((row, index): Message[] => {
    if (!object(row) || !["user", "assistant"].includes(String(row.role)) || typeof row.content !== "string") return [];
    let id = text(row.id, 100) || `restored-${index}`;
    if (ids.has(id)) id = `restored-${index}-${id}`;
    ids.add(id);
    return [{
      id, role: row.role as Message["role"], content: text(row.content, 40000),
      modelContent: typeof row.modelContent === "string" ? text(row.modelContent, 40000) : undefined,
      hadImages: row.hadImages === true,
      replyToId: typeof row.replyToId === "string" ? text(row.replyToId, 100) : undefined,
      personaId: row.role === "assistant" ? "linxi" : undefined,
      errored: row.errored === true, retryable: row.retryable !== false,
      pace: row.pace === "fast" ? "fast" : "deep", streaming: false,
      feedback: row.feedback === "up" || row.feedback === "down" ? row.feedback : undefined,
    }];
  });
}

export function storedMessages(messages: Message[]): Message[] {
  return messages.slice(-120).map((message) => {
    const result = { ...message, errored: message.errored || message.streaming === true, streaming: false, visionPending: false };
    delete result.media; delete result.thinking; delete result.refs;
    return result;
  });
}

export function readCaseMap(value: unknown): CaseMap | null {
  if (!object(value)) return null;
  const list = (key: string) => Array.isArray(value[key]) ? value[key].filter((x): x is string => typeof x === "string").slice(0, 30).map((x) => x.slice(0, 1500)) : [];
  return {
    presenting: text(value.presenting, 3000), workingHypothesis: text(value.workingHypothesis, 3000),
    triggers: list("triggers"), automaticThoughts: list("automaticThoughts"), coreBeliefs: list("coreBeliefs"),
    bodyResponses: list("bodyResponses"), behaviors: list("behaviors"), needsValues: list("needsValues"), resources: list("resources"),
    updatedAt: text(value.updatedAt, 60),
  };
}

export function readScales(value: unknown): ScaleResult[] {
  if (!Array.isArray(value)) return [];
  const lengths: Record<string, number> = { "PHQ-9": 9, "GAD-7": 7, ISI: 7 };
  return value.slice(-30).flatMap((row): ScaleResult[] => {
    if (!object(row) || typeof row.id !== "string" || !(row.id in lengths) || !Array.isArray(row.answers)) return [];
    const max = row.id === "ISI" ? 4 : 3;
    if (row.answers.length !== lengths[row.id] || row.answers.some((x) => !Number.isInteger(x) || x < 0 || x > max)) return [];
    return [{ id: row.id as ScaleResult["id"], answers: row.answers, total: row.answers.reduce((a, b) => a + b, 0), severity: text(row.severity, 100), completedAt: text(row.completedAt, 60) }];
  });
}

export function readSessions(value: unknown): SessionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).flatMap((row): SessionRecord[] => !object(row) || !row.id || !Number.isFinite(Date.parse(String(row.createdAt))) ? [] : [{
    id: text(row.id, 100), createdAt: text(row.createdAt, 60), summary: text(row.summary, 4000), nextStep: text(row.nextStep, 600),
    messages: readMessages(row.messages), scaleResults: readScales(row.scaleResults), caseMap: readCaseMap(row.caseMap),
  }]);
}

export function parseRecordBackup(value: unknown): RecordBackup {
  if (!object(value) || value.format !== "jingshi-records" || value.version !== 1 || !Array.isArray(value.messages) || !Array.isArray(value.sessions)) throw new Error("invalid_backup");
  const settings = object(value.settings) ? value.settings : {};
  return {
    format: "jingshi-records", version: 1, exportedAt: text(value.exportedAt, 60),
    messages: readMessages(value.messages), scaleResults: readScales(value.scaleResults), caseMap: readCaseMap(value.caseMap), sessions: readSessions(value.sessions),
    settings: {
      lang: settings.lang === "en" ? "en" : "zh", theme: settings.theme === "dark" ? "dark" : "light",
      supportRegion: normalizeSupportRegion(settings.supportRegion),
      ageRange: settings.ageRange === "adult" || settings.ageRange === "minor" ? settings.ageRange : "unspecified",
    },
  };
}

export function modelMessages(messages: Message[]) {
  return messages.filter((m) => !m.errored && !m.streaming && (m.modelContent || m.content).trim()).slice(-120)
    .map((m) => ({ role: m.role, content: m.modelContent || m.content }));
}
