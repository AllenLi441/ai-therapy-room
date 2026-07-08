"use client";
/* app.tsx — 静室 orchestration, wired to the real backend.
   Streams POST /api/chat; images go through POST /api/vision (Kimi multimodal)
   and their description is folded into the message so the text model + server
   risk-detection can respond to them. */
import { useEffect, useRef, useState } from "react";
import { personaById, detectRisk, detectScaleNeed, STR, SCALES, type Lang, type Message, type Media } from "./data";
import { Ic } from "./icons";
import { TopBar, PrivacyRibbon, Stream, Composer, Welcome } from "./chat-parts";
import { AboutSheet, ScaleModal, CrisisBanner, CaseDrawer, ConfirmSheet, ConsentGate } from "./overlays";
import type { CaseMap, ScaleResult } from "@/lib/types";
import { REASONING_OPEN, REASONING_CLOSE, EVENT_DELIM } from "@/lib/stream-markers";

let _mid = 0;
const uid = () => "m" + ++_mid;

type Overlay = "about" | "case" | null;

export function App() {
  const [lang, setLang] = useState<Lang>("zh");
  const [theme, setTheme] = useState<string>("light");
  const [pace, setPace] = useState<"deep" | "fast">("deep");
  const persona = personaById("linxi");

  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [scaleId, setScaleId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Scales are no longer a permanent UI entry — only suggested when the
  // conversation shows a matching need, and at most once per scale per session.
  const [suggestedScale, setSuggestedScale] = useState<string | null>(null);
  const offeredScales = useRef<Set<string>>(new Set());
  const exitedCrisisRef = useRef(false); // user tapped "我没事了" → judge next msgs solo until new risk
  const [crisis, setCrisis] = useState(false);
  const [safetyTipOff, setSafetyTipOff] = useState(false); // dismissed for this conversation
  // P3-a: completed self-check results (sent to /api/chat so they actually shape
  // the reply) + the accumulated case understanding (lazily fetched from /api/plan
  // when the drawer opens). Both persist on-device and are wiped by 一键彻底删除.
  const [scaleResults, setScaleResults] = useState<ScaleResult[]>([]);
  const [caseMap, setCaseMap] = useState<CaseMap | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const caseForCount = useRef(-1); // #user-turns the current caseMap reflects
  const [hydrated, setHydrated] = useState(false); // localStorage restored yet?
  const [consented, setConsented] = useState(false); // entry disclaimer accepted?
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  // Keep each turn's request payload so an errored reply can be retried without
  // re-sending the user message (keyed by the AI bubble's id).
  const retryPayloads = useRef<Map<string, { role: string; content: string }[]>>(new Map());
  // Send cooldown: 1.5s after a user-initiated send, on top of the existing `busy`
  // flag (which clears as soon as the reply finishes streaming).
  const [sendCooldown, setSendCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (cooldownTimer.current) clearTimeout(cooldownTimer.current); }, []);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("js_theme", theme); } catch {} }, [theme]);
  useEffect(() => { document.documentElement.lang = lang; try { localStorage.setItem("js_lang", lang); } catch {} }, [lang]);
  // 危机时刻:整个房间的光沉静下来,把注意力让给安全卡(纯呈现,不碰任何安全逻辑)。
  useEffect(() => { document.documentElement.toggleAttribute("data-crisis", crisis); }, [crisis]);

  function pickGreeting(lg: Lang) {
    const hi = lg === "zh" ? `你好，我是${persona.name.zh}。` : `Hi, I'm ${persona.name.en}.`;
    return hi + "\n\n" + STR[lg].today_intro;
  }
  function freshGreeting(lg: Lang): Message {
    return { id: uid(), role: "assistant", personaId: "linxi", content: pickGreeting(lg) };
  }

  // Hydrate everything device-local ONCE: lang/theme, the conversation, the
  // completed scales and the case map. Falls back to a fresh greeting only when
  // nothing was stored. This is what makes "对话只存在你的设备" literally true.
  useEffect(() => {
    let lg: Lang = "zh";
    try {
      const sLg = localStorage.getItem("js_lang");
      const sTh = localStorage.getItem("js_theme");
      if (sLg === "zh" || sLg === "en") { lg = sLg; setLang(sLg); }
      if (sTh === "light" || sTh === "dark") setTheme(sTh);
      if (localStorage.getItem("js_consent") === "1") setConsented(true); // before the chat early-return
      const sScales = localStorage.getItem("js_scales");
      if (sScales) { const arr = JSON.parse(sScales); if (Array.isArray(arr)) setScaleResults(arr); }
      const sCase = localStorage.getItem("js_case");
      if (sCase) { const cm = JSON.parse(sCase); if (cm && typeof cm === "object") setCaseMap(cm); }
      const sChat = localStorage.getItem("js_chat");
      if (sChat) {
        const arr = JSON.parse(sChat) as Message[];
        if (Array.isArray(arr) && arr.length) {
          let maxId = 0;
          for (const m of arr) { const n = parseInt(String(m.id).slice(1), 10); if (Number.isFinite(n) && n > maxId) maxId = n; }
          _mid = Math.max(_mid, maxId); // never re-mint a hydrated id
          setMessages(arr.map((m) => ({ ...m, streaming: false })));
          setHydrated(true);
          return;
        }
      }
    } catch { /* corrupt storage — fall through to a fresh greeting */ }
    setMessages([freshGreeting(lg)]);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refresh greeting if language flips and nothing's been said yet
  useEffect(() => {
    setMessages((ms) => (ms.length === 1 && ms[0].role === "assistant" ? [{ ...ms[0], content: pickGreeting(lang) }] : ms));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Persist after each COMPLETED turn (never mid-stream), stripping in-memory-only
  // flags and base64 media so we stay well under the ~5MB localStorage quota.
  useEffect(() => {
    if (!hydrated || busy) return;
    try {
      const slim = messages.slice(-120).map((m) => ({
        ...m,
        streaming: false,
        thinking: undefined, // transparency-only + can be large — don't persist
        media: m.media?.filter((x) => !x.url.startsWith("data:"))
      }));
      localStorage.setItem("js_chat", JSON.stringify(slim));
    } catch { /* quota / serialization — skip this write */ }
  }, [messages, busy, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("js_scales", JSON.stringify(scaleResults)); } catch {}
  }, [scaleResults, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try { if (caseMap) localStorage.setItem("js_case", JSON.stringify(caseMap)); else localStorage.removeItem("js_case"); } catch {}
  }, [caseMap, hydrated]);

  async function send(text: string, attachments: Media[]) {
    setSendCooldown(true);
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => setSendCooldown(false), 1500);
    const media = attachments || [];
    const hasImages = media.some((m) => m.type === "image");
    const userMsg: Message = { id: uid(), role: "user", content: text, media, visionPending: hasImages };
    const userId = userMsg.id;
    const aiId = uid();
    const aiMsg: Message = { id: aiId, role: "assistant", personaId: "linxi", content: "", streaming: true, startedAt: Date.now(), pace };
    const history = [...messagesRef.current, userMsg];
    setMessages((ms) => [...ms, userMsg, aiMsg]);
    setBusy(true);
    const risky = detectRisk(text);
    setCrisis(risky); // track the current turn — banner can clear, no longer sticky
    if (risky) exitedCrisisRef.current = false; // a genuinely risky message re-enters safety mode
    if (!risky) {
      // offer a self-check only when a theme surfaces (sleep/anxiety/low mood), once each
      const need = detectScaleNeed(text);
      if (need && !offeredScales.current.has(need)) { offeredScales.current.add(need); setSuggestedScale(need); }
    }

    // images → /api/vision (Kimi) → fold description into the text the model sees
    let visionNote = "";
    const images = media.filter((m) => m.type === "image");
    if (images.length) {
      try {
        const descs = await Promise.all(
          images.map(async (im) => {
            const r = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: im.url }) });
            const d = (await r.json().catch(() => ({}))) as { description?: string };
            return d.description || "";
          })
        );
        const joined = descs.filter(Boolean).join("；");
        if (joined) visionNote = lang === "zh" ? `\n\n[我发了图片，内容大致是：${joined}]` : `\n\n[I sent image(s); roughly: ${joined}]`;
      } catch { /* vision failed — continue with text only */ }
      // vision finished (ok or failed) — clear the "looking at the image…" caption
      setMessages((ms) => ms.map((m) => (m.id === userId ? { ...m, visionPending: false } : m)));
    }

    const fallbackText = text || (media.length ? (lang === "zh" ? "（我发了一张图片）" : "(I sent an image)") : "");
    const backendContent = fallbackText + visionNote;
    const payloadMsgs = history.map((m, i) =>
      i === history.length - 1 ? { role: "user", content: backendContent } : { role: m.role, content: m.content }
    );
    retryPayloads.current.set(aiId, payloadMsgs);
    await streamReply(aiId, payloadMsgs);
  }

  // Send the request and stream it into the AI bubble `aiId`. Shared by the first
  // send and by retry, so the truthful error state always has a way back.
  async function streamReply(aiId: string, payloadMsgs: { role: string; content: string }[]) {
    setBusy(true);
    const setAi = (fn: (c: string) => string) =>
      setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, content: fn(m.content) } : m)));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMsgs, pace, personaId: "linxi", language: lang, exitedCrisis: exitedCrisisRef.current, crisisModeActive: crisis, scaleResults })
      });
      if (res.headers.get("X-Crisis-Triggered") === "1") setCrisis(true);
      const kh = res.headers.get("X-Knowledge");
      if (kh) {
        try {
          const refs = JSON.parse(decodeURIComponent(kh));
          if (Array.isArray(refs) && refs.length) {
            setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, refs } : m)));
          }
        } catch { /* malformed header — just skip the 数据来源 chip */ }
      }
      if (!res.ok) {
        // truthful error state — do NOT pretend we're still generating
        let errText: string;
        if (res.status === 429) errText = STR[lang].err_busy;
        else if (res.status === 413) errText = (await res.text().catch(() => "")).trim() || STR[lang].err_too_long;
        else errText = STR[lang].err_connect;
        setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, content: errText, errored: true } : m)));
      } else if (!res.body) {
        const tx = (await res.text()) || (lang === "zh" ? "（没有收到回复）" : "(No reply)");
        setAi(() => tx);
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        // The stream interleaves three things, delimited by control chars:
        //   REASONING_OPEN…REASONING_CLOSE = 思考过程 (deep), EVENT_DELIM{json}EVENT_DELIM
        //   = a process event (the 安全识别 result), everything else = the answer.
        let phase: "answer" | "thinking" | "event" = "answer";
        let evtBuf = "";
        const apply = (think: string, content: string) =>
          setMessages((ms) => ms.map((m) => (m.id === aiId
            ? { ...m, thinking: (m.thinking || "") + think, content: m.content + content }
            : m)));
        const applySafety = (status: Message["safety"]) => {
          if (!status) return;
          setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, safety: status } : m)));
          if (status === "crisis" || status === "suicide_concern") setCrisis(true);
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          let rest = dec.decode(value, { stream: true });
          while (rest.length) {
            if (phase === "event") {
              const e = rest.indexOf(EVENT_DELIM);
              if (e === -1) { evtBuf += rest; rest = ""; }
              else {
                evtBuf += rest.slice(0, e);
                try { const o = JSON.parse(evtBuf); if (o && o.type === "safety") applySafety(o.status); } catch { /* malformed event */ }
                evtBuf = ""; phase = "answer"; rest = rest.slice(e + 1);
              }
            } else if (phase === "thinking") {
              const c = rest.indexOf(REASONING_CLOSE);
              if (c === -1) { apply(rest, ""); rest = ""; }
              else { if (c > 0) apply(rest.slice(0, c), ""); phase = "answer"; rest = rest.slice(c + 1); }
            } else {
              const o = rest.indexOf(REASONING_OPEN);
              const e = rest.indexOf(EVENT_DELIM);
              const next = [o, e].filter((i) => i !== -1).sort((a, b) => a - b)[0];
              if (next === undefined) { apply("", rest); rest = ""; }
              else {
                if (next > 0) apply("", rest.slice(0, next));
                if (next === o) { phase = "thinking"; rest = rest.slice(o + 1); }
                else { phase = "event"; evtBuf = ""; rest = rest.slice(e + 1); }
              }
            }
          }
        }
      }
    } catch {
      setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, content: STR[lang].err_connect, errored: true } : m)));
    } finally {
      setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, streaming: false } : m)));
      setBusy(false);
    }
  }

  // Retry a failed turn: reset the errored bubble and re-run the SAME request, so
  // the user never has to retype. Falls back to rebuilding the payload from history
  // (e.g. an errored bubble restored from localStorage after a refresh).
  function onRetry(aiId: string) {
    if (busy) return;
    let payload = retryPayloads.current.get(aiId);
    if (!payload) {
      const idx = messagesRef.current.findIndex((m) => m.id === aiId);
      if (idx <= 0) return;
      payload = messagesRef.current.slice(0, idx).map((m) => ({ role: m.role, content: m.content }));
      retryPayloads.current.set(aiId, payload);
    }
    setMessages((ms) => ms.map((m) => (m.id === aiId ? { ...m, content: "", thinking: "", safety: undefined, errored: false, streaming: true, startedAt: Date.now() } : m)));
    void streamReply(aiId, payload);
  }

  // Per-turn beta feedback ("有帮到 / 没帮到"): mark the message itself (persisted via
  // the js_chat effect above) and append a compact record to js_feedback for export.
  function onFeedback(aiId: string, verdict: "up" | "down") {
    const ms = messagesRef.current;
    const idx = ms.findIndex((m) => m.id === aiId);
    if (idx < 0) return;
    const aiMsg = ms[idx];
    if (aiMsg.role !== "assistant" || aiMsg.streaming || aiMsg.errored) return;
    setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, feedback: verdict } : m)));
    let userText = "";
    for (let i = idx - 1; i >= 0; i--) { if (ms[i].role === "user") { userText = ms[i].content; break; } }
    try {
      const raw = localStorage.getItem("js_feedback");
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      list.push({
        ts: Date.now(),
        turnIndex: idx,
        verdict,
        userText: userText.slice(0, 200),
        aiText: aiMsg.content.slice(0, 400),
        pace: aiMsg.pace ?? null,
        safety: aiMsg.safety ?? null
      });
      localStorage.setItem("js_feedback", JSON.stringify(list));
    } catch { /* quota / serialization — skip this write */ }
  }

  // Single-message delete (task C, v0.9.0) — separate from doDeleteAll below.
  // Removes only this one bubble, never its paired turn; the existing js_chat
  // persistence effect (keyed off `messages`) saves the change automatically.
  // js_feedback records for this message are left untouched — the export is a
  // historical snapshot, not a live view of the current conversation.
  function onDeleteMessage(id: string) {
    setMessages((ms) => ms.filter((m) => m.id !== id));
  }

  function doDeleteAll() {
    // "一键彻底删除" must clear EVERYTHING device-local, not just the chat state —
    // including consent, so a fresh start re-asks for it.
    try { localStorage.removeItem("js_chat"); localStorage.removeItem("js_scales"); localStorage.removeItem("js_case"); localStorage.removeItem("js_consent"); localStorage.removeItem("js_feedback"); } catch {}
    caseForCount.current = -1;
    retryPayloads.current.clear();
    setBusy(false); setCrisis(false); setConsented(false); setSafetyTipOff(false);
    setScaleResults([]); setCaseMap(null);
    setMessages([freshGreeting(lang)]);
    setConfirmingDelete(false);
  }

  // Lazily fetch the REAL accumulated understanding from /api/plan when the drawer
  // opens. Throttled: too little said → honest empty state (no call); already
  // fresh for this turn count → reuse the cached map (no call).
  async function openCase() {
    setOverlay("case");
    const convo = messagesRef.current;
    const userTurns = convo.filter((m) => m.role === "user").length;
    if (userTurns < 2) return;             // not enough to understand — empty state
    if (caseForCount.current === userTurns) return; // already current
    setCaseLoading(true);
    try {
      const payloadMsgs = convo.map((m) => ({ role: m.role, content: m.content }));
      const r = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMsgs, personaId: "linxi", caseMap, scaleResults })
      });
      if (r.ok) {
        const d = (await r.json().catch(() => null)) as { plan?: { caseMap?: CaseMap } } | null;
        if (d?.plan?.caseMap) { setCaseMap(d.plan.caseMap); caseForCount.current = userTurns; }
      }
    } catch { /* keep the prior map / empty state */ }
    finally { setCaseLoading(false); }
  }

  const started = messages.some((m) => m.role === "user");

  return (
    <div className="app" style={{ "--tone": persona.av } as React.CSSProperties}>
      <TopBar
        lang={lang} theme={theme} persona={persona}
        onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onLang={() => setLang(lang === "zh" ? "en" : "zh")}
        onPersona={() => setOverlay("about")}
        onCase={openCase}
      />
      <PrivacyRibbon lang={lang} onDelete={() => setConfirmingDelete(true)} />
      {crisis && (
        <CrisisBanner
          lang={lang}
          onDismiss={() => { setCrisis(false); exitedCrisisRef.current = true; }}
        />
      )}

      <div className="chat-wrap">
        {started
          ? <Stream messages={messages} persona={persona} lang={lang} onRetry={onRetry} onFeedback={onFeedback} onDelete={onDeleteMessage} />
          : <Welcome lang={lang} companion={persona} onStart={(s) => void send(s, [])} />}
        {suggestedScale && !scaleId && !crisis && (
          <div className="scale-suggest" role="status">
            <span className="ss-ico"><Ic.clipboard /></span>
            <span className="ss-text">
              {STR[lang].scale_suggest}（{SCALES[suggestedScale].name[lang].split(" · ")[1] || SCALES[suggestedScale].name[lang]}）
            </span>
            <button className="ss-cta" onClick={() => { setScaleId(suggestedScale); setSuggestedScale(null); }}>{STR[lang].scale_suggest_cta}</button>
            <button className="ss-dismiss" onClick={() => setSuggestedScale(null)} aria-label={STR[lang].scale_dismiss}><Ic.close /></button>
          </div>
        )}
        {started && !crisis && !safetyTipOff && (
          <div className="scale-suggest" role="note">
            <span className="ss-ico" aria-hidden>📞</span>
            <span className="ss-text">{STR[lang].safety_tip}</span>
            <button className="ss-dismiss" onClick={() => setSafetyTipOff(true)} aria-label={STR[lang].safety_tip_dismiss}><Ic.close /></button>
          </div>
        )}
        <Composer lang={lang} pace={pace} busy={busy || sendCooldown} tone={persona.av} onSend={(t, a) => void send(t, a)} onPace={setPace} />
      </div>

      {overlay === "about" && <AboutSheet lang={lang} companion={persona} onClose={() => setOverlay(null)} />}
      {scaleId && <ScaleModal lang={lang} scaleId={scaleId} onClose={() => setScaleId(null)} onComplete={(r) => setScaleResults((prev) => [...prev, r])} />}
      {overlay === "case" && <CaseDrawer lang={lang} caseMap={caseMap} loading={caseLoading} onClose={() => setOverlay(null)} />}
      {confirmingDelete && <ConfirmSheet lang={lang} onConfirm={doDeleteAll} onClose={() => setConfirmingDelete(false)} />}
      {hydrated && !consented && (
        <ConsentGate lang={lang} onAccept={() => { try { localStorage.setItem("js_consent", "1"); } catch {} setConsented(true); }} />
      )}
    </div>
  );
}
