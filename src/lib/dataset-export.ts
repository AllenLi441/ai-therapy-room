import { createHash } from "node:crypto";
import type { BlindItem } from "./dataset-studio";
import type { DonatedMessage } from "./donations";
import { redactText } from "./redact";
import { isCrisisMessage, parseReplyAlternatives, parseTurnTrace, type TurnTrace } from "./turn-trace";

/**
 * Turns shared conversations (Supabase `donations` rows) into training files. Pure, so the
 * export script stays a thin I/O wrapper (scripts/dataset/export-donations.ts) and every
 * rule here is unit-tested on synthetic rows. Real rows never enter the repository.
 */

export type DonationExportRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  consent_version: string;
  age_bracket: string;
  language: string;
  support_region: string | null;
  app_version: string;
  messages: unknown;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

export type ExportConversation = {
  id: string;
  /** Stable stand-in for `id` in training files: the row id is also the deletion key. */
  anon_id: string;
  created_at: string;
  updated_at: string;
  app_version: string;
  language: string;
  age_bracket: string;
  minor: boolean;
  support_region: string | null;
  had_crisis: boolean;
  /** Spans that look like a school, company, hospital or compound name. Not masked
   * automatically (the patterns also hit everyday phrases); the conversation stays out of
   * sft/dpo until a person checks it and adds `pii_review_key` to the cleared list. */
  pii_suspects: string[];
  pii_review_key: string;
  pii_cleared: boolean;
  messages: DonatedMessage[];
};

// Upload-time masking (redactText) is deliberately narrow. These offline patterns only
// fire in an unambiguous context: "叫我" is left alone because it usually means "tells me
// to" (他叫我去死), and a bare 3号 or 第3单元 is a date or a textbook unit, not an address.
const EXTRA_MASKS: Array<[RegExp, string]> = [
  [/(我姓|我的小名是|我小名叫)\s*[一-龥]{1,3}/g, "$1[NAME]"],
  [/(住在|家住|家在|住址是?|地址是?)\s*[^，。！？,.!?\s]{1,24}/g, "$1[ADDRESS]"],
  [/\d+\s*(?:号楼|栋|幢)(?:\s*\d+\s*单元)?(?:\s*\d+\s*室)?/g, "[ADDRESS]"],
];

export function maskOffline(text: string): string {
  return EXTRA_MASKS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), redactText(text));
}

const PLACE_SUFFIX = /(?:中学|小学|高中|初中|大学|学院|学校|附中|附小|职高|中专|技校|幼儿园|公司|集团|医院|诊所|小区|花园|大厦)(?!生)/g;
const NUMBERED_SCHOOL = /[一二三四五六七八九十\d]{1,3}中(?![文国午间心学考医药级等途])/g;
// Words that end a name when walking back from a suffix: "想考|大学", "我们|公司", "我在|实验中学".
// Characters that also occur inside names (和 in 协和, 家 in 万家, 新, 进, 好, 老) are not here.
const BOUNDARY = new Set("在去到了的是我你他她们个所这那都也还就被从跟上读考念想要回过来很太又才说".split(""));
const NAME_CHAR = /[一-龥A-Za-z0-9]/;

export function piiSuspects(text: string): string[] {
  const found: string[] = [];
  for (const match of [...text.matchAll(PLACE_SUFFIX), ...text.matchAll(NUMBERED_SCHOOL)]) {
    let start = match.index;
    while (start > 0 && match.index - start < 8 && NAME_CHAR.test(text[start - 1]) && !BOUNDARY.has(text[start - 1])) start--;
    const name = text.slice(start, match.index);
    if (name.length >= 2 || /^[一二三四五六七八九十\d]/.test(match[0])) found.push(name + match[0]);
  }
  return found;
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function readMessage(value: unknown): DonatedMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if ((row.role !== "user" && row.role !== "assistant") || typeof row.content !== "string" || !row.content.trim()) return null;
  const meta = row.role === "assistant" ? parseTurnTrace(row.meta) : undefined;
  const alternatives = row.role === "assistant" ? parseReplyAlternatives(row.alternatives) : undefined;
  return {
    role: row.role,
    content: maskOffline(row.content),
    ...(typeof row.safety === "string" ? { safety: row.safety } : {}),
    ...(row.pace === "deep" || row.pace === "fast" ? { pace: row.pace } : {}),
    ...(row.feedback === "up" || row.feedback === "down" ? { feedback: row.feedback } : {}),
    ...(typeof row.ts === "number" ? { ts: row.ts } : {}),
    ...(row.role === "user" && row.hadImages === true ? { hadImages: true as const } : {}),
    ...(meta ? { meta } : {}),
    ...(alternatives ? { alternatives: alternatives.map((alt) => ({ ...alt, content: maskOffline(alt.content) })) } : {}),
  };
}

/** `cleared` holds `pii_review_key`s a person has checked (scripts/dataset README). */
export function normalizeDonation(row: DonationExportRow, cleared: ReadonlySet<string> = new Set()): ExportConversation | null {
  const messages = Array.isArray(row.messages) ? row.messages.map(readMessage).filter((m): m is DonatedMessage => m !== null) : [];
  if (!messages.some((m) => m.role === "user")) return null;
  const texts = messages.flatMap((m) => [m.content, ...(m.alternatives ?? []).map((alt) => alt.content)]);
  const suspects = [...new Set(texts.flatMap(piiSuspects))].sort();
  const reviewKey = `${row.id}:${sha(suspects.join("|")).slice(0, 12)}`;
  return {
    id: row.id,
    anon_id: sha(row.id).slice(0, 16),
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    app_version: row.app_version,
    language: row.language,
    age_bracket: row.age_bracket,
    minor: row.age_bracket !== "18+",
    support_region: row.support_region,
    had_crisis: messages.some(isCrisisMessage),
    pii_suspects: suspects,
    pii_review_key: reviewKey,
    pii_cleared: suspects.length > 0 && cleared.has(reviewKey),
    messages,
  };
}

const usable = (conversation: ExportConversation) => !conversation.pii_suspects.length || conversation.pii_cleared;

/** A reply worth imitating: written by the model on the normal route outside a crisis
 * session, with a completed danger check that found nothing, no retrieved evidence it would
 * be trained to recite without, and not marked unhelpful. Everything else is product rules,
 * unchecked, or risky, and goes to the safety review instead. */
export function isTrainableReply(message: DonatedMessage, trace: TurnTrace | undefined = message.meta): boolean {
  return message.role === "assistant" && !!trace?.model && trace.route === "deepseek_normal" &&
    !trace.decision?.intercept && !trace.crisis && !trace.guard && !trace.refs?.length &&
    trace.judge?.kind === "ok" && (trace.judge.severity ?? "none") === "none" &&
    message.safety === "safe" && message.feedback !== "down";
}

/** The reply answers a text-only user turn right before it. */
const answersUser = (messages: DonatedMessage[], index: number) =>
  messages[index - 1]?.role === "user" && !messages[index - 1].hadImages;

const CONTEXT_TURNS = 20;
/** Chat templates want alternating turns that start with the user: drop the leading
 * greeting/assistant turns and merge same-role runs left by removed messages. */
function context(messages: DonatedMessage[], end: number): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const { role, content } of messages.slice(Math.max(0, end - CONTEXT_TURNS), end)) {
    if (!turns.length && role === "assistant") continue;
    const last = turns[turns.length - 1];
    if (last?.role === role) last.content += `\n\n${content}`;
    else turns.push({ role, content });
  }
  return turns;
}

/** TRL conversational prompt/completion format: only the completion is trained on. */
export function buildSft(conversation: ExportConversation) {
  if (!usable(conversation)) return [];
  return conversation.messages.flatMap((message, index) => {
    if (!isTrainableReply(message) || !answersUser(conversation.messages, index)) return [];
    return [{
      id: `${conversation.anon_id}:${index}`,
      conversation: conversation.anon_id,
      language: conversation.language,
      minor: conversation.minor,
      feedback: message.feedback ?? null,
      meta: message.meta,
      prompt: context(conversation.messages, index),
      completion: [{ role: "assistant" as const, content: message.content }],
    }];
  });
}

/** Preference pairs from "换个说法" in TRL's conversational format: the reply the user
 * kept beats each one they replaced. Skipped when a replaced one was marked helpful, since
 * then the user's choice is not a clear preference. */
export function buildDpo(conversation: ExportConversation) {
  if (!usable(conversation)) return [];
  return conversation.messages.flatMap((message, index) => {
    if (!message.alternatives?.length || !isTrainableReply(message) || !answersUser(conversation.messages, index)) return [];
    return message.alternatives.flatMap((alt, altIndex) => alt.feedback === "up" || alt.meta?.guard ? [] : [{
      id: `${conversation.anon_id}:${index}:${altIndex}`,
      conversation: conversation.anon_id,
      language: conversation.language,
      minor: conversation.minor,
      prompt: context(conversation.messages, index),
      chosen: [{ role: "assistant" as const, content: message.content }],
      rejected: [{ role: "assistant" as const, content: alt.content }],
      chosen_meta: message.meta,
      rejected_meta: alt.meta ?? null,
    }]);
  });
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

type ReviewCandidate = { conversation: ExportConversation; userIndex: number; reply?: DonatedMessage };

function hidePlaces(text: string, suspects: string[]): string {
  return suspects.reduce((out, suspect) => out.split(suspect).join("[PLACE]"), text);
}

/** User turns for blind risk labelling in the dataset studio: every turn the product
 * treated as risky or could not check, plus a fixed ~10% of ordinary turns to find what it
 * missed. The blind file shows user turns only, with suspected place names hidden; the
 * mapping file (kept apart from reviewers) links each item back to the conversation and to
 * what the product did. */
export function buildSafetyReview(conversations: ExportConversation[]) {
  const candidates: ReviewCandidate[] = conversations.flatMap((conversation) => conversation.messages.flatMap((message, index): ReviewCandidate[] => {
    if (message.role !== "user") return [];
    const reply = conversation.messages[index + 1]?.role === "assistant" ? conversation.messages[index + 1] : undefined;
    const trace = reply?.meta;
    const flagged = !reply || !trace || trace.route !== "deepseek_normal" || trace.decision?.intercept || trace.crisis || trace.guard ||
      trace.judge?.kind !== "ok" || (trace.judge.severity ?? "none") !== "none" || reply.safety !== "safe";
    return flagged || stableHash(`${conversation.id}:${index}`) % 10 === 0 ? [{ conversation, userIndex: index, reply }] : [];
  }));
  const ordered = candidates.sort((a, b) => stableHash(`${a.conversation.id}:${a.userIndex}`) - stableHash(`${b.conversation.id}:${b.userIndex}`));
  const blind: BlindItem[] = [];
  const mapping: Array<Record<string, unknown>> = [];
  ordered.forEach(({ conversation, userIndex, reply }, order) => {
    const userTurns = conversation.messages.slice(0, userIndex + 1).filter((m) => m.role === "user");
    const id = `D${String(order + 1).padStart(4, "0")}`;
    blind.push({
      sequence: order + 1,
      blind_item_id: id,
      target_turn: userTurns.length,
      conversation: userTurns.map((turn, i) => `第${i + 1}轮${i === userTurns.length - 1 ? "（请标本轮）" : ""}: ${hidePlaces(turn.content, conversation.pii_suspects)}`).join("\n"),
      set: "donations",
    });
    mapping.push({
      blind_item_id: id,
      conversation_id: conversation.id,
      message_index: userIndex,
      minor: conversation.minor,
      route: reply?.meta?.route ?? null,
      safety: reply?.safety ?? null,
      judge: reply?.meta?.judge ?? null,
      decision: reply?.meta?.decision ?? null,
      crisis_session: reply?.meta?.crisis ?? false,
    });
  });
  return { blind, mapping };
}

export function buildStats(conversations: ExportConversation[], counts: { sft: number; dpo: number; review: number }) {
  const tally = (values: string[]) => values.reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});
  const replies = conversations.flatMap((c) => c.messages.filter((m) => m.role === "assistant"));
  return {
    conversations: conversations.length,
    user_turns: conversations.reduce((n, c) => n + c.messages.filter((m) => m.role === "user").length, 0),
    by_language: tally(conversations.map((c) => c.language)),
    by_age_bracket: tally(conversations.map((c) => c.age_bracket)),
    with_crisis: conversations.filter((c) => c.had_crisis).length,
    pii_waiting_review: conversations.filter((c) => c.pii_suspects.length && !c.pii_cleared).length,
    pii_cleared: conversations.filter((c) => c.pii_cleared).length,
    reply_routes: tally(replies.map((m) => m.meta?.route ?? "no_trace")),
    trainable_replies: replies.filter((m) => isTrainableReply(m)).length,
    feedback: tally(replies.flatMap((m) => m.feedback ? [m.feedback] : [])),
    ...counts,
  };
}
