"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { personaById, detectRisk, detectScaleNeed, STR, SCALES, type AgeRange, type Lang, type Message, type Media, type SupportRegion } from "./data";
import { Ic } from "./icons";
import { TopBar, PrivacyRibbon, Stream, Composer, Welcome } from "./chat-parts";
import { AboutSheet, ScaleModal, CrisisBanner, CaseDrawer, ConfirmSheet, ConsentGate, SettingsSheet, SupportSheet, type ShareSetting } from "./overlays";
import { ImportRecords, SessionHistory, SessionSummary } from "./session-panels";
import { DONATION_CONSENT_VERSION } from "@/lib/donations";
import { CONSENT_VERSION, STORAGE_KEYS, RequestScope, modelMessages, parseRecordBackup, readCaseMap, readMessages, readScales, readSessions, storedMessages, type RecordBackup, type SessionRecord } from "./session-state";
import { assessRisk } from "@/lib/safety";
import { normalizeSupportRegion } from "@/lib/support-regions";
import { contentLanguage, normalizeLanguage } from "@/lib/languages";
import type { CaseMap, ScaleResult } from "@/lib/types";
import { REASONING_OPEN, REASONING_CLOSE, EVENT_DELIM } from "@/lib/stream-markers";
import type { ThinkingLevel } from "@/lib/model-options";
import styles from "./session-panels.module.css";

const uid = () => crypto.randomUUID();
type Overlay = "about" | "case" | "support" | "summary" | "history" | "settings" | null;
const subscribeHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
function readInitialState() {
  const read = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const string = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
  const lang: Lang = normalizeLanguage(string("js_lang"));
  const messages = readMessages(read("js_chat"));
  return {
    lang, theme: string("js_theme") === "dark" ? "dark" : "light",
    supportRegion: normalizeSupportRegion(string("js_support_region")),
    ageRange: (["adult", "minor"].includes(string("js_age_range") || "") ? string("js_age_range") : "unspecified") as AgeRange,
    consented: string("js_consent") === CONSENT_VERSION,
    messages: messages.length ? messages : [{ id: uid(), role: "assistant", personaId: "linxi", content: `${STR[lang].hello}\n\n${STR[lang].today_intro}` } as Message],
    scaleResults: readScales(read("js_scales")), caseMap: readCaseMap(read("js_case")), caseEdited: string("js_case_edited") === "1",
    sessions: readSessions(read("js_sessions")), activeSession: string("js_active_session"), continuation: (string("js_continuation") || "").slice(0, 3000),
    share: (["18+", "14-17"].includes(string("js_share") || "") ? string("js_share") : "off") as ShareSetting,
    sharedIds: (Array.isArray(read("js_share_ids")) ? read("js_share_ids") : []).filter((id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)).slice(-500),
    shareCurrent: /^[0-9a-f-]{36}$/.test(string("js_share_current") || "") ? string("js_share_current") : null,
  };
}
class StorageStatus {
  private message: string | null = null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.message;
  set(message: string | null) { if (message !== this.message) { this.message = message; for (const listener of this.listeners) listener(); } }
}

export function App() {
  const ready = useSyncExternalStore(subscribeHydration, getClientSnapshot, getServerSnapshot);
  return ready ? <ClientApp /> : <div className="app" aria-busy="true" />;
}
function ClientApp() {
  const [initial] = useState(readInitialState);
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [theme, setTheme] = useState(initial.theme);
  const [pace, setPace] = useState<"deep" | "fast">("deep");
  // Thinking depth per pace (default off for both); the composer edits the current pace's level.
  const [thinkingByPace, setThinkingByPace] = useState<Record<"deep" | "fast", ThinkingLevel>>({ deep: "off", fast: "off" });
  const thinking = thinkingByPace[pace];
  const [supportRegion, setSupportRegion] = useState<SupportRegion>(initial.supportRegion);
  const [ageRange, setAgeRange] = useState<AgeRange>(initial.ageRange);
  const persona = personaById("linxi");
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const messagesRef = useRef<Message[]>(initial.messages);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Uploading conversations to improve Jingshi: asked in the opening consent, changed in
  // Settings. Only offered when storage is set up (NEXT_PUBLIC_DONATIONS=1 + Supabase keys).
  const sharing = process.env.NEXT_PUBLIC_DONATIONS === "1";
  const [share, setShare] = useState<ShareSetting>(initial.share);
  const shareRef = useRef(initial.share);
  const [sharedIds, setSharedIds] = useState<string[]>(initial.sharedIds);
  const shareConv = useRef<string | null>(initial.shareCurrent);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [scaleId, setScaleId] = useState<string | null>(null);
  const [suggestedScale, setSuggestedScale] = useState<string | null>(null);
  const offeredScales = useRef(new Set<string>());
  const exitedCrisisRef = useRef(false);
  const [crisis, setCrisis] = useState(false);
  const crisisRef = useRef(false);
  const [scaleResults, setScaleResults] = useState<ScaleResult[]>(initial.scaleResults);
  const [caseMap, setCaseMap] = useState<CaseMap | null>(initial.caseMap);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [caseEdited, setCaseEdited] = useState(initial.caseEdited);
  const caseForRevision = useRef(-1);
  const revision = useRef(0);
  const hydrated = true;
  const [consented, setConsented] = useState(initial.consented);
  const scope = useRef(new RequestScope());
  const [storageStatus] = useState(() => new StorageStatus());
  const storageError = useSyncExternalStore(storageStatus.subscribe, storageStatus.snapshot, () => null);
  const setStorageError = (message: string | null) => storageStatus.set(message);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [sessions, setSessions] = useState<SessionRecord[]>(initial.sessions);
  const [activeSession, setActiveSession] = useState<string | null>(initial.activeSession);
  const [continuation, setContinuation] = useState(initial.continuation);
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarySaved, setSummarySaved] = useState(false);
  const [pendingImport, setPendingImport] = useState<RecordBackup | null>(null);
  const [dataError, setDataError] = useState<string | undefined>();

  function replaceMessages(next: Message[] | ((previous: Message[]) => Message[])) {
    const resolved = typeof next === "function" ? next(messagesRef.current) : next;
    messagesRef.current = resolved;
    setMessages(resolved);
  }
  function updateCrisis(value: boolean) { crisisRef.current = value; setCrisis(value); }
  function freshGreeting(language: Lang): Message {
    return { id: uid(), role: "assistant", personaId: "linxi", content: `${STR[language].hello}\n\n${STR[language].today_intro}` };
  }
  function writeStorage(key: string, value: unknown) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    } catch {
      setStorageError(STR[lang].err_storage_save);
    }
  }

  useEffect(() => {
    const requests = scope.current;
    return () => requests.invalidate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = lang;
    document.documentElement.setAttribute("data-theme", theme);
    writeStorage("js_lang", lang); writeStorage("js_theme", theme);
    writeStorage("js_support_region", supportRegion); writeStorage("js_age_range", ageRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, theme, supportRegion, ageRange, hydrated]);
  useEffect(() => { document.documentElement.toggleAttribute("data-crisis", crisis); return () => document.documentElement.removeAttribute("data-crisis"); }, [crisis]);
  useEffect(() => {
    if (!hydrated || busy) return;
    writeStorage("js_chat", storedMessages(messages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    writeStorage("js_scales", scaleResults); writeStorage("js_case", caseMap); writeStorage("js_case_edited", caseEdited ? "1" : null);
    writeStorage("js_sessions", sessions); writeStorage("js_active_session", activeSession); writeStorage("js_continuation", continuation || null);
    writeStorage("js_share", share); writeStorage("js_share_ids", sharedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleResults, caseMap, caseEdited, sessions, activeSession, continuation, share, sharedIds, hydrated]);

  function invalidateRequests() {
    scope.current.invalidate(); revision.current += 1;
    busyRef.current = false; setBusy(false); setCaseLoading(false); setSummaryLoading(false);
    replaceMessages((items) => items.map((message) => message.streaming ? {
      ...message, streaming: false, visionPending: false, errored: true, thinking: undefined,
      content: `${message.content}${message.content ? "\n\n" : ""}${STR[lang].reply_stopped}`,
    } : { ...message, visionPending: false }));
  }
  function markError(aiId: string, message: string, retryable = true) {
    replaceMessages((ms) => ms.map((m) => m.id === aiId ? { ...m, content: m.content.trim() ? `${m.content}\n\n${message}` : message, errored: true, retryable, streaming: false, thinking: undefined } : m));
  }
  async function responseError(response: Response) {
    if (response.status === 429) return STR[lang].err_busy as string;
    if (response.status === 413) return STR[lang].err_too_long as string;
    try { const data = await response.json(); if (typeof data.message === "string") return data.message; } catch { /* non-JSON service error */ }
    return STR[lang].err_connect as string;
  }

  async function runTurn(aiId: string, userId: string, previouslyInCrisis = crisisRef.current) {
    const request = scope.current.start();
    const timeout = setTimeout(request.abort, 90000);
    busyRef.current = true; setBusy(true);
    const updateAi = (change: Partial<Message> | ((message: Message) => Partial<Message>)) => {
      if (!request.current()) return;
      replaceMessages((ms) => ms.map((m) => m.id === aiId ? { ...m, ...(typeof change === "function" ? change(m) : change) } : m));
    };
    const fail = (message: string, retryable = true) => { if (request.current()) markError(aiId, message, retryable); };
    try {
      const user = messagesRef.current.find((m) => m.id === userId && m.role === "user");
      if (!user) return;
      let content = user.modelContent;
      if (!content) {
        const images = user.media?.filter((m) => m.type === "image") || [];
        if (user.hadImages && !images.length) {
          fail(STR[lang].err_image_not_stored, false);
          return;
        }
        let description = "";
        if (images.length) {
          const descriptions = await Promise.all(images.map(async (im) => {
            const response = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: im.url, language: lang }), signal: request.signal });
            if (!response.ok) throw new Error(await responseError(response));
            const data = await response.json();
            if (typeof data.description !== "string" || !data.description.trim()) throw new Error(STR[lang].err_image_unread);
            return data.description;
          }));
          description = contentLanguage(lang) === "zh" ? `\n\n[图片描述：${descriptions.join("；")}]` : `\n\n[Image description: ${descriptions.join("; ")}]`;
        }
        if (!request.current()) return;
        content = (user.content || STR[lang].image_sent) + description;
        replaceMessages((ms) => ms.map((m) => m.id === userId ? { ...m, modelContent: content, visionPending: false } : m));
      }
      if (!request.current()) return;
      const currentHardRisk = assessRisk(content).shouldEscalate;
      if (currentHardRisk) updateCrisis(true);
      const index = messagesRef.current.findIndex((m) => m.id === aiId);
      if (index < 0) return;
      const payload = modelMessages(messagesRef.current.slice(0, index));
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal,
        body: JSON.stringify({ messages: payload, pace, thinking, personaId: "linxi", language: lang, exitedCrisis: exitedCrisisRef.current, crisisModeActive: previouslyInCrisis, scaleResults, caseMap, supportRegion, ageRange, continuationNote: continuation, availableScale: detectScaleNeed(user.content) }),
      });
      if (!request.current()) return;
      if (response.headers.get("X-Crisis-Triggered") === "1") updateCrisis(true);
      if (!response.ok) { fail(await responseError(response)); return; }
      const references = response.headers.get("X-Knowledge");
      if (references) { try { const refs = JSON.parse(decodeURIComponent(references)); if (Array.isArray(refs)) updateAi({ refs }); } catch { /* optional header */ } }
      if (!response.body) { fail(STR[lang].err_connect); return; }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let phase: "answer" | "thinking" | "event" = "answer";
      let thinkingStartedAt = 0;
      let event = "";
      let interrupted = false;
      let answerLength = 0;
      const consume = (chunk: string) => {
        let answer = "", thinking = "";
        const flush = () => {
          if (answer || thinking) updateAi((m) => ({ content: m.content + answer, thinking: (m.thinking || "") + thinking }));
          answerLength += answer.trim().length; answer = ""; thinking = "";
        };
        for (const char of chunk) {
          if (phase === "event") {
            if (char !== EVENT_DELIM) { event += char; continue; }
            flush();
            try {
              const data = JSON.parse(event);
              if (data.type === "safety" && ["safe", "unchecked", "gentle", "suicide_concern", "crisis"].includes(data.status)) {
                const status = currentHardRisk ? "crisis" : data.status;
                updateAi({ safety: status });
                if (request.current() && status !== "unchecked") updateCrisis(status === "crisis" || status === "suicide_concern");
              } else if (data.type === "error") {
                interrupted = true;
                fail(typeof data.message === "string" ? data.message : STR[lang].err_connect, data.retryable !== false);
              }
            } catch { /* malformed optional event */ }
            event = ""; phase = "answer";
          } else if (char === REASONING_OPEN) { phase = "thinking"; thinkingStartedAt = Date.now(); }
          else if (char === REASONING_CLOSE) {
            phase = "answer";
            if (thinkingStartedAt) { const thinkingMs = Date.now() - thinkingStartedAt; updateAi({ thinkingMs }); thinkingStartedAt = 0; }
          }
          else if (char === EVENT_DELIM) { flush(); phase = "event"; }
          else if (phase === "thinking") thinking += char;
          else answer += char;
        }
        flush();
      };
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (!request.current()) { await reader.cancel(); return; }
          if (done) break;
          consume(decoder.decode(value, { stream: true }));
        }
        consume(decoder.decode());
        if (!interrupted && !answerLength && request.current()) fail(STR[lang].err_connect);
      } finally { reader.releaseLock(); }
    } catch (error) {
      if (request.current()) fail(error instanceof Error && error.name !== "AbortError" && error.message !== "Failed to fetch" ? error.message : STR[lang].err_connect);
    } finally {
      clearTimeout(timeout); request.release();
      if (request.current()) {
        updateAi({ streaming: false });
        replaceMessages((ms) => ms.map((m) => m.id === userId ? { ...m, visionPending: false } : m));
        busyRef.current = false; setBusy(false);
        void shareConversation();
      }
    }
  }

  async function send(text: string, media: Media[]) {
    if (!hydrated || !consented || busyRef.current || (!text.trim() && !media.length) || text.length > 4000) return;
    invalidateRequests(); setSummarySaved(false); setSummary(""); setNextStep("");
    const userId = uid(), aiId = uid();
    const hadImages = media.some((m) => m.type === "image");
    replaceMessages((ms) => [...ms,
      { id: userId, role: "user", content: text.trim(), media, hadImages, visionPending: hadImages },
      { id: aiId, role: "assistant", replyToId: userId, personaId: "linxi", content: "", streaming: true, startedAt: Date.now(), pace },
    ]);
    const previouslyInCrisis = crisisRef.current;
    const risky = detectRisk(text);
    if (risky) { updateCrisis(true); exitedCrisisRef.current = false; setSuggestedScale(null); }
    else {
      const need = detectScaleNeed(text);
      if (need && !offeredScales.current.has(need)) { offeredScales.current.add(need); setSuggestedScale(need); }
    }
    await runTurn(aiId, userId, previouslyInCrisis);
  }
  function onRetry(aiId: string) {
    if (busyRef.current || !consented) return;
    const index = messagesRef.current.findIndex((m) => m.id === aiId);
    const ai = messagesRef.current[index];
    if (!ai || ai.retryable === false) return;
    const userId = ai.replyToId || (messagesRef.current[index - 1]?.role === "user" ? messagesRef.current[index - 1].id : null);
    if (!userId || !messagesRef.current.some((m) => m.id === userId && m.role === "user")) return;
    invalidateRequests(); setSummary(""); setNextStep(""); setSummarySaved(false);
    replaceMessages((ms) => ms.map((m) => m.id === aiId ? { ...m, content: "", thinking: "", errored: false, safety: undefined, streaming: true, startedAt: Date.now() } : m));
    void runTurn(aiId, userId);
  }
  function stopReply() { invalidateRequests(); }
  function onFeedback(aiId: string, verdict: "up" | "down") {
    const ms = messagesRef.current, index = ms.findIndex((m) => m.id === aiId), ai = ms[index];
    if (!ai || ai.role !== "assistant" || ai.streaming || ai.errored) return;
    replaceMessages((items) => items.map((m) => m.id === aiId ? { ...m, feedback: verdict } : m));
    const user = [...ms.slice(0, index)].reverse().find((m) => m.role === "user");
    try {
      const value = JSON.parse(localStorage.getItem("js_feedback") || "[]");
      const items = Array.isArray(value) ? value : [];
      writeStorage("js_feedback", [...items.filter((item) => item.aiId !== aiId), { aiId, userId: user?.id, ts: Date.now(), verdict, userText: user?.content.slice(0, 200) || "", aiText: ai.content.slice(0, 400), pace: ai.pace, safety: ai.safety }].slice(-200));
    } catch { writeStorage("js_feedback", []); }
  }
  function onDeleteMessage(id: string) {
    invalidateRequests();
    const before = messagesRef.current;
    const removedIndex = before.findIndex((m) => m.id === id);
    const next = before.filter((m) => m.id !== id).map((m) => {
      const wasReply = m.replyToId === id || (!m.replyToId && before[removedIndex + 1]?.id === m.id && before[removedIndex]?.role === "user");
      return { ...m, streaming: false, visionPending: false, feedback: undefined, retryable: wasReply ? false : m.retryable, errored: m.errored || m.streaming, thinking: m.streaming ? undefined : m.thinking };
    });
    replaceMessages(next);
    setCaseMap(null); setCaseEdited(false); caseForRevision.current = -1;
    setSummary(""); setNextStep(""); setSummarySaved(false); setContinuation("");
    // Derived snapshots can contain the removed text; invalidate them conservatively.
    setSessions((items) => items.filter((item) => !item.messages.some((m) => m.id === id)));
    if (activeSession) setActiveSession(null);
    writeStorage("js_feedback", null);
    setSuggestedScale(null); setCaseError(null);
  }
  function resetConversation() {
    invalidateRequests();
    replaceMessages([freshGreeting(lang)]); setScaleResults([]); setCaseMap(null); setCaseEdited(false); setCaseError(null);
    caseForRevision.current = -1; offeredScales.current.clear(); exitedCrisisRef.current = false; updateCrisis(false);
    setSuggestedScale(null); setScaleId(null); setOverlay(null); setSummary(""); setNextStep(""); setSummaryError(null); setSummarySaved(false);
    setActiveSession(null); setContinuation(""); setDraftRevision((n) => n + 1);
    setShareConv(null);
  }
  function doDeleteAll() {
    resetConversation(); setSessions([]); setConsented(false); setAgeRange("unspecified"); setSupportRegion("OTHER"); changeShare("off");
    setConfirmingDelete(false); setPendingImport(null); setDataError(undefined);
    try { for (const key of STORAGE_KEYS) localStorage.removeItem(key); } catch { setStorageError(STR[lang].err_storage_clear); }
  }

  async function openCase(force = false) {
    if (!consented) return;
    setOverlay("case");
    if (busyRef.current) { setCaseError(STR[lang].case_wait); return; }
    if (caseLoading || (!force && (caseEdited || caseForRevision.current === revision.current))) return;
    const convo = modelMessages(messagesRef.current);
    if (convo.filter((m) => m.role === "user").length < 2) return;
    const request = scope.current.start(), snapshot = revision.current;
    const timeout = setTimeout(request.abort, 45000);
    setCaseLoading(true); setCaseError(null);
    try {
      const response = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal, body: JSON.stringify({ messages: convo, personaId: "linxi", language: lang, caseMap, scaleResults }) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!request.current()) return;
      if (snapshot !== revision.current) { setCaseError(STR[lang].case_changed); return; }
      const result = readCaseMap(data?.plan?.caseMap);
      if (!result) throw new Error();
      setCaseMap(result); setCaseEdited(false); caseForRevision.current = snapshot;
    } catch { if (request.current()) setCaseError(STR[lang].case_failed); }
    finally { clearTimeout(timeout); request.release(); if (request.current()) setCaseLoading(false); }
  }
  function editCase(next: CaseMap) {
    invalidateRequests(); setCaseMap(next); setCaseEdited(true); setCaseError(null); caseForRevision.current = revision.current;
    setSummary(""); setNextStep(""); setSummarySaved(false); setContinuation("");
    if (activeSession) setSessions((items) => items.filter((item) => item.id !== activeSession));
    setActiveSession(null);
  }
  async function openSummary() {
    if (busyRef.current || !consented || summaryLoading) return;
    setOverlay("summary"); setSummarySaved(false); setSummaryError(null);
    const request = scope.current.start(), snapshot = revision.current;
    const timeout = setTimeout(request.abort, 65000);
    setSummaryLoading(true);
    try {
      const response = await fetch("/api/summary", { method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal, body: JSON.stringify({ messages: modelMessages(messagesRef.current), language: lang, caseMap, scaleResults }) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!request.current()) return;
      if (snapshot !== revision.current || typeof data.summary !== "string" || !data.summary.trim()) throw new Error();
      setSummary(data.summary.slice(0, 4000));
    } catch { if (request.current()) setSummaryError(STR[lang].summary_failed); }
    finally { clearTimeout(timeout); request.release(); if (request.current()) setSummaryLoading(false); }
  }
  function saveSummary(startNew = false) {
    if (!summary.trim() || busyRef.current || summaryLoading) return;
    const id = activeSession || uid();
    const record: SessionRecord = { id, createdAt: new Date().toISOString(), summary: summary.trim(), nextStep: nextStep.trim(), messages: storedMessages(messagesRef.current), scaleResults, caseMap, ...(shareConv.current ? { donationId: shareConv.current } : {}) };
    setSessions((items) => [...items.filter((item) => item.id !== id), record].slice(-20));
    setActiveSession(id); setSummarySaved(true);
    if (startNew) resetConversation();
  }
  function resumeSession(record: SessionRecord) {
    resetConversation(); replaceMessages(readMessages(record.messages)); setScaleResults(record.scaleResults); setCaseMap(record.caseMap); setCaseEdited(true);
    setActiveSession(record.id); setSummary(record.summary); setNextStep(record.nextStep);
    setShareConv(record.donationId ?? null);
    setContinuation(`${record.summary}\n${record.nextStep}`.slice(0, 3000));
  }
  function setShareConv(id: string | null) { shareConv.current = id; writeStorage("js_share_current", id); }
  function changeShare(next: ShareSetting) { shareRef.current = next; setShare(next); }
  /** After each reply: upload the whole current conversation (masked server-side), one row per
   * conversation that is replaced as it grows. Best effort; never blocks the chat. */
  async function shareConversation() {
    const ageBracket = shareRef.current;
    if (!sharing || ageBracket === "off") return;
    const turns = messagesRef.current.filter((m) => !m.streaming && !m.errored && m.content.trim()).slice(-240)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 12000), safety: m.safety, pace: m.pace, feedback: m.feedback }));
    if (!turns.some((m) => m.role === "user")) return;
    const id = shareConv.current ?? crypto.randomUUID();
    try {
      const response = await fetch("/api/donate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, messages: turns, ageBracket, language: lang, supportRegion, consentVersion: DONATION_CONSENT_VERSION }) });
      if (!response.ok || shareConv.current === id) return;
      setShareConv(id); setSharedIds((ids) => ids.includes(id) ? ids : [...ids, id].slice(-500));
    } catch { /* best effort */ }
  }
  async function deleteShared() {
    const ids = sharedIds;
    if (!ids.length) { setSettingsNotice(STR[lang].share_none); return; }
    const results = await Promise.all(ids.map((id) => fetch("/api/donate", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      .then((response) => response.ok ? id : null).catch(() => null)));
    const gone = new Set(results.filter((id): id is string => id !== null));
    setSharedIds(ids.filter((id) => !gone.has(id)));
    if (shareConv.current && gone.has(shareConv.current)) setShareConv(null);
    setSettingsNotice(STR[lang][gone.size === ids.length ? "share_deleted" : "share_delete_failed"]);
  }
  function deleteSession(id: string) {
    setSessions((items) => items.filter((item) => item.id !== id));
    writeStorage("js_feedback", null);
    if (activeSession === id) { resetConversation(); setOverlay("history"); }
  }
  function exportData() {
    const backup: RecordBackup = { format: "jingshi-records", version: 1, exportedAt: new Date().toISOString(), messages: storedMessages(messagesRef.current), scaleResults, caseMap, sessions, settings: { lang, theme, supportRegion, ageRange } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `jingshi-records-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importData(file: File) {
    setDataError(undefined);
    const request = scope.current.start();
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error();
      const backup = parseRecordBackup(JSON.parse(await file.text()));
      if (request.current()) setPendingImport(backup);
    } catch { if (request.current()) setDataError(STR[lang].import_failed); }
    finally { request.release(); }
  }
  function confirmImport() {
    if (!pendingImport) return;
    const backup = pendingImport; resetConversation();
    replaceMessages(backup.messages.length ? backup.messages : [freshGreeting(backup.settings.lang)]);
    setScaleResults(backup.scaleResults); setCaseMap(backup.caseMap); setCaseEdited(true); setSessions(backup.sessions);
    setLang(backup.settings.lang); setTheme(backup.settings.theme); setSupportRegion(backup.settings.supportRegion); setAgeRange(backup.settings.ageRange);
    writeStorage("js_feedback", null); setPendingImport(null);
  }

  const started = messages.some((m) => m.role === "user");
  // Openers follow topics from the last few saved sessions (stays in this browser).
  const starterHistory = sessions.slice(-5).flatMap((session) => [session.summary, ...session.messages.filter((m) => m.role === "user").map((m) => m.content)]).join("\n");
  function changeLanguage(next: Lang) { setLang(next); if (!started) replaceMessages([freshGreeting(next)]); }
  return <div className="app" style={{ "--tone": persona.av } as React.CSSProperties}>
    <TopBar lang={lang} theme={theme} persona={persona} onSettings={() => setOverlay("settings")} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onLang={changeLanguage} onPersona={() => setOverlay("about")} onCase={() => void openCase()} onSupport={() => setOverlay("support")} />
    <PrivacyRibbon lang={lang} onDelete={() => setConfirmingDelete(true)} />
    {storageError && <p className={styles.notice} role="alert">{storageError}</p>}
    {crisis && <CrisisBanner lang={lang} region={supportRegion} onRegionChange={setSupportRegion} onDismiss={() => { updateCrisis(false); exitedCrisisRef.current = true; }} />}
    <div className={styles.toolbar}>
      {started && <button className="btn ghost" disabled={busy || summaryLoading || !consented} onClick={() => void openSummary()}>{STR[lang].pause_today}</button>}
      <button className="btn ghost" disabled={!consented || busy} onClick={() => setOverlay("history")}>{STR[lang].past_sessions}</button>
    </div>
    <main className="chat-wrap">
      {started ? <Stream messages={messages} persona={persona} lang={lang} onRetry={onRetry} onFeedback={onFeedback} onDelete={onDeleteMessage} /> : <Welcome key={`${lang}-${ageRange}`} lang={lang} ageRange={ageRange} history={starterHistory} companion={persona} onStart={(text) => void send(text, [])} />}
      {suggestedScale && !scaleId && !crisis && <div className="scale-suggest" role="status"><span className="ss-ico"><Ic.clipboard /></span><span className="ss-text">{STR[lang].scale_suggest}{(lang.startsWith("zh") ? "（{name}）" : " ({name})").replace("{name}", SCALES[suggestedScale].name[contentLanguage(lang)].split(" · ")[1])}</span><button className="ss-cta" onClick={() => { setScaleId(suggestedScale); setSuggestedScale(null); }}>{STR[lang].scale_suggest_cta}</button><button className="ss-dismiss" onClick={() => setSuggestedScale(null)} aria-label={STR[lang].scale_dismiss}><Ic.close /></button></div>}
      <Composer key={draftRevision} lang={lang} pace={pace} busy={busy || !consented || !hydrated} tone={persona.av} onSend={(text, attachments) => void send(text, attachments)} onPace={setPace} thinking={thinking} onThinking={(level) => setThinkingByPace((current) => ({ ...current, [pace]: level }))} onStop={busy ? stopReply : undefined} />
    </main>
    {overlay === "about" && <AboutSheet lang={lang} companion={persona} onClose={() => setOverlay(null)} onExportData={exportData} onImportData={(file) => void importData(file)} dataError={dataError} />}
    {overlay === "support" && <SupportSheet lang={lang} region={supportRegion} onRegionChange={setSupportRegion} onClose={() => setOverlay(null)} />}
    {scaleId && <ScaleModal lang={lang} scaleId={scaleId} region={supportRegion} onRegionChange={setSupportRegion} onClose={() => setScaleId(null)} onComplete={(result) => setScaleResults((previous) => [...previous, result].slice(-30))} />}
    {overlay === "case" && <CaseDrawer lang={lang} caseMap={caseMap} loading={caseLoading} error={caseError} notice={caseEdited ? STR[lang].case_edited_notice : null} onRetry={() => void openCase(true)} onChange={editCase} onClose={() => setOverlay(null)} />}
    {overlay === "summary" && <SessionSummary lang={lang} summary={summary} nextStep={nextStep} loading={summaryLoading} error={summaryError} saved={summarySaved} onSummary={(value) => { setSummary(value); setSummarySaved(false); }} onNextStep={(value) => { setNextStep(value); setSummarySaved(false); }} onRetry={() => void openSummary()} onSave={() => saveSummary()} onNew={() => saveSummary(true)} onClose={() => setOverlay(null)} />}
    {overlay === "history" && <SessionHistory lang={lang} sessions={sessions} onResume={resumeSession} onDelete={deleteSession} onClose={() => setOverlay(null)} />}
    {overlay === "settings" && <SettingsSheet lang={lang} onLang={changeLanguage} theme={theme} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} ageRange={ageRange} onAgeRange={setAgeRange} region={supportRegion} onRegion={setSupportRegion} sharing={sharing} share={share} onShare={changeShare} onDeleteShared={() => void deleteShared()} notice={settingsNotice} onClose={() => { setOverlay(null); setSettingsNotice(""); }} />}
    {confirmingDelete && <ConfirmSheet lang={lang} onConfirm={doDeleteAll} onClose={() => setConfirmingDelete(false)} />}
    {pendingImport && <ImportRecords lang={lang} backup={pendingImport} onClose={() => setPendingImport(null)} onConfirm={confirmImport} />}
    {hydrated && !consented && <ConsentGate lang={lang} onLang={changeLanguage} region={supportRegion} onRegionChange={setSupportRegion} ageRange={ageRange} onAgeRangeChange={setAgeRange} sharing={sharing} onAccept={(choice) => { changeShare(choice); writeStorage("js_consent", CONSENT_VERSION); setConsented(true); }} />}
  </div>;
}
