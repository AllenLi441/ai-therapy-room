"use client";
/* chat-parts.tsx — Presence, TopBar, Privacy, Stream, Bubble, Composer, Welcome, CalmMode
   (ported from the design handoff; window-globals → ES modules + types) */
import { useEffect, useRef, useState } from "react";
import { Ic } from "./icons";
import { STR, personaById, type Lang, type Media, type Message, type Persona } from "./data";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Waiting-for-first-token indicator. Shows the typing dots plus a REAL elapsed-
 * seconds counter (counts up from when the request was sent — not a fake countdown
 * or a fixed timer). Once the first token arrives the bubble switches to the live
 * caret, so every state here is bound to a real event.
 */
function Thinking({ startedAt, lang }: { startedAt?: number; lang: Lang }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  return (
    <span className="thinking">
      <span className="typing"><i /><i /><i /></span>
      <span className="thinking-label">
        {STR[lang].status_thinking}{secs >= 2 ? ` · ${secs}s` : ""}
      </span>
    </span>
  );
}

/* the virtual presence — a soft glowing orb, no face. realized in CSS. */
export function Presence({ size = 34, glow = false, breathe = true, className = "" }:
  { size?: number; glow?: boolean; breathe?: boolean; className?: string }) {
  return (
    <span className={"presence " + (breathe ? "breathe " : "") + className} style={{ width: size, height: size }} aria-hidden="true">
      {glow && <span className="glow" />}
      <span className="halo" />
      <span className="core" />
    </span>
  );
}

export function Avatar({ size = 34, glow = false, className = "" }: { size?: number; glow?: boolean; className?: string }) {
  return <Presence size={size} glow={glow} className={className} />;
}

export function TopBar({ lang, theme, persona, onTheme, onLang, onPersona, onCase }: {
  lang: Lang; theme: string; persona: Persona;
  onTheme: () => void; onLang: () => void; onPersona: () => void; onCase: () => void;
}) {
  const t = STR[lang];
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <div><div className="brand-name">静室</div></div>
        <div className="brand-sub hide-sm">{t.sub}</div>
      </div>
      <div className="topbar-spacer" />
      <button className="persona-chip" onClick={onPersona} aria-label={t.about_title}>
        <Avatar size={32} />
        <div className="persona-chip-text hide-sm">
          <div className="persona-chip-name">{persona.name[lang]}</div>
          <div className="persona-chip-role">{persona.role[lang]}</div>
        </div>
        <Ic.chev className="chev" />
      </button>
      <button className="icon-btn" onClick={onCase} title={t.case_title}><Ic.insight /></button>
      <button className="icon-btn" onClick={onLang} title="中 / EN" aria-label="language"><Ic.lang /></button>
      <button className="icon-btn" onClick={onTheme} aria-label="theme">{theme === "dark" ? <Ic.sun /> : <Ic.moon />}</button>
    </header>
  );
}

export function PrivacyRibbon({ lang, onDelete }: { lang: Lang; onDelete: () => void }) {
  const t = STR[lang];
  return (
    <div className="privacy">
      <Ic.lock />
      <span><b>{t.privacy_a}</b> · {t.privacy_b} <span className="del" onClick={onDelete}>{t.privacy_del}</span></span>
    </div>
  );
}

export function Bubble({ m, persona, lang, onRetry }: { m: Message; persona: Persona; lang: Lang; onRetry?: (id: string) => void }) {
  const isAI = m.role === "assistant";
  const p = m.personaId ? personaById(m.personaId) : persona;
  const hasText = !!m.content && m.content.length > 0;
  const hasMedia = !!m.media && m.media.length > 0;
  return (
    <div className={"msg " + (isAI ? "ai" : "user")}>
      {isAI ? <Avatar size={34} /> : <div className="avatar user-av" aria-hidden="true"><Ic.user style={{ width: 18, height: 18 }} /></div>}
      <div className="msg-body">
        <div className="msg-who">{isAI ? p.name[lang] : (lang === "zh" ? "你" : "You")}</div>
        <div className={"bubble" + (hasMedia && !hasText ? " media-only" : "") + (m.errored ? " bubble-error" : "")}>
          {hasMedia && (
            <div className="bubble-media">
              {m.media!.map((md) => md.type === "image"
                ? <img key={md.id} src={md.url} alt={md.name || ""} />
                : <video key={md.id} src={md.url} controls playsInline />)}
            </div>
          )}
          {m.visionPending && <span className="vision-pending">{STR[lang].vision_loading}</span>}
          {hasText && <span className="bubble-text">{m.content}</span>}
          {m.streaming && m.content === "" && <Thinking startedAt={m.startedAt} lang={lang} />}
          {m.streaming && m.content !== "" && <span className="caret" />}
        </div>
        {m.errored && onRetry && (
          <button className="retry-btn" onClick={() => onRetry(m.id)}>
            <Ic.refresh className="retry-ico" /> {STR[lang].retry}
          </button>
        )}
      </div>
    </div>
  );
}

export function Stream({ messages, persona, lang, onRetry }: { messages: Message[]; persona: Persona; lang: Lang; onRetry?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);            // are we pinned to the bottom?
  const [showJump, setShowJump] = useState(false);

  const nearBottom = () => {
    const el = ref.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  const onScroll = () => {
    const nb = nearBottom();
    stick.current = nb;
    setShowJump((s) => (s === !nb ? s : !nb));
  };

  // Keep the latest turn in view, but ONLY when the user is already at the bottom —
  // never yank someone who scrolled up to re-read. scrollIntoView on a bottom
  // sentinel inside rAF lands reliably AFTER the new bubble's layout is committed,
  // which the old `scrollTop = scrollHeight` (read too early) did not guarantee.
  useEffect(() => {
    if (!stick.current) return;
    const id = requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(id);
  }, [messages]);

  const jump = () => {
    stick.current = true;
    setShowJump(false);
    // Jump in ONE reliable step: setting scrollTop directly lands at the true
    // bottom immediately. (Smooth scrollIntoView raced the scroll listener, so
    // the button could linger / not reach the very bottom.)
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Announce to screen readers that a reply is arriving — once per state change
  // (not per token, which would be unbearably chatty).
  const replying = messages.some((m) => m.streaming);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">{replying ? STR[lang].status_thinking : ""}</div>
      <div className="stream scroll" ref={ref} onScroll={onScroll}>
        <div className="stream-inner">
          {messages.map((m) => <Bubble key={m.id} m={m} persona={persona} lang={lang} onRetry={onRetry} />)}
          <div ref={endRef} className="stream-end" aria-hidden="true" />
        </div>
      </div>
      {showJump && (
        <button className="jump-latest" onClick={jump} aria-label={STR[lang].jump_latest}>
          <Ic.chev className="jump-arrow" /> {STR[lang].jump_latest}
        </button>
      )}
    </>
  );
}

export function Composer({ lang, pace, busy, onSend, onPace }: {
  lang: Lang; pace: "deep" | "fast"; busy: boolean; tone?: string;
  onSend: (text: string, atts: Media[]) => void; onPace: (p: "deep" | "fast") => void;
}) {
  const t = STR[lang];
  const [val, setVal] = useState("");
  const [atts, setAtts] = useState<Media[]>([]);
  const [attErr, setAttErr] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);

  const grow = () => {
    const el = ta.current; if (!el) return;
    el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 168) + "px";
  };
  useEffect(grow, [val]);

  // auto-dismiss the attach error after a few seconds
  useEffect(() => {
    if (!attErr) return;
    const id = setTimeout(() => setAttErr(""), 4000);
    return () => clearTimeout(id);
  }, [attErr]);

  // Image only — Kimi vision takes images, not video. Guard count, size and type,
  // and tell the user when something is rejected (silently dropping files is worse).
  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const MAX_IMAGES = 6;
    const MAX_MB = 8;
    const room = MAX_IMAGES - atts.length;
    const accepted: File[] = [];
    let err = "";
    for (const f of Array.from(files)) {
      if (accepted.length >= room) { err = t.att_too_many.replace("{n}", String(MAX_IMAGES)); break; }
      if (!f.type.startsWith("image/")) { err = t.att_not_image; continue; }
      if (f.size > MAX_MB * 1024 * 1024) { err = t.att_too_big.replace("{mb}", String(MAX_MB)); continue; }
      accepted.push(f);
    }
    setAttErr(err);
    if (!accepted.length) return;
    // base64 data URL — used for both display AND /api/vision (Kimi).
    const next: Media[] = await Promise.all(accepted.map(async (f) => ({
      id: Math.random().toString(36).slice(2),
      type: "image" as const,
      url: await fileToDataUrl(f),
      name: f.name
    })));
    setAtts((a) => [...a, ...next]);
  };
  const removeAtt = (id: string) => setAtts((a) => a.filter((x) => x.id !== id));

  const canSend = (val.trim() || atts.length > 0) && !busy;
  const submit = () => {
    if (!canSend) return;
    onSend(val.trim(), atts);
    setVal(""); setAtts([]);
    requestAnimationFrame(() => { if (ta.current) ta.current.style.height = "auto"; });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };
  return (
    <div className="composer-zone">
      {attErr && <div className="attach-err" role="status">{attErr}</div>}
      {atts.length > 0 && (
        <div className="attach-previews">
          {atts.map((a) => (
            <div key={a.id} className="attach-thumb">
              <img src={a.url} alt={a.name} />
              <button className="thumb-x" onClick={() => removeAtt(a.id)} aria-label="remove"><Ic.close /></button>
            </div>
          ))}
        </div>
      )}
      <div className="composer">
        <div className="attach-wrap">
          <button className="tool-btn" onClick={() => imgInput.current?.click()} aria-label={t.import_image} title={t.import_image}><Ic.plus /></button>
          <input ref={imgInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void addImages(e.target.files); e.target.value = ""; }} />
        </div>
        <textarea ref={ta} value={val} rows={1} onChange={(e) => setVal(e.target.value)} onKeyDown={onKey} placeholder={t.placeholder} aria-label={t.placeholder} />
        <button className="send-btn" onClick={submit} disabled={!canSend} aria-label={t.send}><Ic.send /></button>
      </div>
      <div className="composer-meta">
        <span className="disclaimer"><Ic.heart style={{ color: "var(--ink-3)" }} />{t.disclaimer}</span>
        <div className="pace-toggle" role="group" aria-label="pace">
          <button className={pace === "deep" ? "on" : ""} onClick={() => onPace("deep")}>{t.pace_deep}</button>
          <button className={pace === "fast" ? "on" : ""} onClick={() => onPace("fast")}>{t.pace_fast}</button>
        </div>
      </div>
    </div>
  );
}

export function Welcome({ lang, companion, onStart }: { lang: Lang; companion: Persona; onStart: (s: string) => void }) {
  const t = STR[lang];
  return (
    <div className="welcome scroll">
      <div className="welcome-orb"><Presence size={134} glow breathe /></div>
      <h1>{companion.name[lang]}</h1>
      <div className="w-role">{companion.role[lang]}</div>
      <p className="w-line">{t.welcome_line}</p>
      <div className="starters">
        {(t.starters as string[]).map((s, i) => <button key={i} className="starter" onClick={() => onStart(s)}>{s}</button>)}
      </div>
      <span className="w-priv"><Ic.lock />{t.privacy_a}</span>
    </div>
  );
}

export function CalmMode({ lang, onBreathe, onHotline, onContact, onBack }: {
  lang: Lang; onBreathe: () => void; onHotline: () => void; onContact: () => void; onBack: () => void;
}) {
  const t = STR[lang];
  return (
    <div className="calm">
      <div className="welcome-orb"><Presence size={150} glow breathe /></div>
      <h2>{t.calm_title}</h2>
      <p>{t.calm_sub}</p>
      <div className="calm-actions">
        <button className="calm-btn" onClick={onBreathe}>{t.calm_breathe}</button>
        <button className="calm-btn alert" onClick={onHotline}>{t.calm_hotline}</button>
        <button className="calm-btn" onClick={onContact}>{t.calm_contact}</button>
      </div>
      <button className="calm-back" onClick={onBack}>{t.calm_back}</button>
    </div>
  );
}
