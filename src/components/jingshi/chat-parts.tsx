"use client";
/* chat-parts.tsx — Presence, TopBar, Privacy, Stream, Bubble, Composer, Welcome
   (ported from the design handoff; window-globals → ES modules + types) */
import { useEffect, useRef, useState } from "react";
import { Ic } from "./icons";
import { STR, personaById, type Lang, type Media, type Message, type Persona } from "./data";
import { CN_PRIMARY_HOTLINES, CN_SUPPLEMENTAL, INTL_RESOURCES } from "@/lib/crisis-resources";

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

// Resource-block divider the server prepends to a tail crisis/suicide-concern
// intervention (see lib/safety.ts createCrisisResourceBlock) — purely a rendering
// marker, not clinical wording, so splitting on it doesn't touch safety text.
const SAFETY_DIVIDER = "━━━━━━━━";

// Hotline numbers that can appear inside that resource block, read ONLY from the
// crisis-resources SSOT — never a generic phone-number regex (a pattern like
// \d{3}-\d{3}-\d{4} would mis-split a number such as 400-161-9995). Longest token
// first so a shorter number can never "win" inside a longer one it happens to be a
// substring of.
const stripSpaces = (s: string) => s.split(" ").join("");
const HOTLINE_TOKENS: { token: string; tel: string }[] = [
  ...CN_PRIMARY_HOTLINES.map((h) => ({ token: h.number, tel: h.tel })),
  { token: CN_SUPPLEMENTAL.beijing, tel: CN_SUPPLEMENTAL.beijing },
  { token: CN_SUPPLEMENTAL.hope24, tel: CN_SUPPLEMENTAL.hope24 },
  { token: INTL_RESOURCES.usEmergency, tel: INTL_RESOURCES.usEmergency },
  { token: INTL_RESOURCES.usCrisis, tel: INTL_RESOURCES.usCrisis },
  { token: INTL_RESOURCES.ukSamaritans, tel: stripSpaces(INTL_RESOURCES.ukSamaritans) },
  { token: INTL_RESOURCES.auLifeline, tel: stripSpaces(INTL_RESOURCES.auLifeline) }
].sort((a, b) => b.token.length - a.token.length);

// Exact-string scan (no RegExp): walk the text once, and at every position check
// whether a known hotline token starts there. Plain characters are batched into text
// runs; a match becomes a tel: link. `findahelpline.com` (a URL, not a number) is
// deliberately not in the token list and stays plain text.
function linkifyHotlines(text: string) {
  const out: (string | React.ReactElement)[] = [];
  let i = 0;
  let buf = "";
  let key = 0;
  const flush = () => { if (buf) { out.push(buf); buf = ""; } };
  while (i < text.length) {
    const hit = HOTLINE_TOKENS.find((e) => text.startsWith(e.token, i));
    if (hit) {
      flush();
      out.push(<a key={key++} className="tel-link" href={"tel:" + hit.tel}>{hit.token}</a>);
      i += hit.token.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  flush();
  return out;
}

/**
 * Single-message delete button (task C, v0.9.0) — separate from the existing
 * one-tap "彻底删除" (which wipes the whole conversation). Lives in the corner of
 * every message (user + AI), shown on hover/keyboard-focus via CSS, or via a
 * 500ms long-press on touch (no hover there). Two-stage confirm guards against
 * mis-taps: first tap swaps the icon for a "删除?" label (3s auto-revert, no
 * full-screen modal — that ceremony belongs to the all-at-once delete only);
 * a second tap actually deletes.
 */
function MsgDelete({ lang, onDelete }: { lang: Lang; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [touchShow, setTouchShow] = useState(false);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);
  const onTouchStart = () => {
    touchTimer.current = setTimeout(() => setTouchShow(true), 500);
  };
  const onTouchEnd = () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
  };
  const click = () => {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    onDelete();
  };
  return (
    <button
      type="button"
      className={"msg-del-btn" + (confirming ? " confirm" : "") + (touchShow ? " show" : "")}
      onClick={click}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-label={STR[lang].msg_delete}
      aria-live={confirming ? "polite" : undefined}
    >
      {confirming ? STR[lang].msg_delete_confirm : <Ic.trash />}
    </button>
  );
}

/**
 * The tail safety intervention (hotlines + safety check), rendered as its own
 * visually-distinct card instead of plain paragraph text. In fast pace this event
 * lands AFTER the visible answer has finished streaming, so on first mount we pull
 * the user's eye back to it: a smooth scroll + a one-time (CSS, mount-triggered)
 * appear animation. aria-live is scoped to this card only, never the whole page.
 */
function SafetyIntervention({ text, autoScroll }: { text: string; autoScroll: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoScroll) return;
    const id = requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="safety-intervention" ref={ref} aria-live="assertive">
      {linkifyHotlines(text)}
    </div>
  );
}

/* the virtual presence — 一笔圆 (ensō): a single hand-drawn ink ring, no face.
   Same component contract everywhere (size/glow/breathe/className) — only the
   drawing changed, from a glowing blob to a brushed circle in celadon ink. */
export function Presence({ size = 34, glow = false, breathe = true, className = "" }:
  { size?: number; glow?: boolean; breathe?: boolean; className?: string }) {
  return (
    <span className={"presence " + (breathe ? "breathe " : "") + className} style={{ width: size, height: size }} aria-hidden="true">
      {glow && <span className="enso-glow" />}
      <svg className="enso-ring" viewBox="0 0 40 40" width="100%" height="100%">
        {/* the brush lifts before closing the circle — the gap is the "一笔" */}
        <path
          d="M22 4 C31 4.5 36.5 11 36.5 20 C36.5 29.5 28.5 36.5 19 36.5 C10 36.5 3.8 30 3.6 21 C3.4 15.5 6 11 10 8.2"
          fill="none" stroke="var(--sage)" strokeWidth="2.3" strokeLinecap="round" opacity=".92"
        />
        {/* the tail thins as the ink runs out */}
        <path
          d="M3.6 21 C3.4 15.5 6 11 10 8.2"
          fill="none" stroke="var(--sage)" strokeWidth="1.3" strokeLinecap="round" opacity=".38"
        />
        {/* where the brush first touched down */}
        <circle cx="22" cy="4" r="1.9" fill="var(--sage)" />
      </svg>
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
      <div className="brand"><span className="brand-name">静室</span></div>
      <div className="topbar-spacer" />
      <button className="persona-chip" onClick={onPersona} aria-label={t.about_title}>
        <Avatar size={26} />
        <span className="persona-chip-name hide-sm">{persona.name[lang]}</span>
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

export function Bubble({ m, persona, lang, onRetry, onFeedback, onDelete }: {
  m: Message; persona: Persona; lang: Lang; onRetry?: (id: string) => void;
  onFeedback?: (id: string, verdict: "up" | "down") => void;
  onDelete?: (id: string) => void;
}) {
  const isAI = m.role === "assistant";
  const p = m.personaId ? personaById(m.personaId) : persona;
  const hasText = !!m.content && m.content.length > 0;
  const hasMedia = !!m.media && m.media.length > 0;
  // A crisis/suicide-concern reply carries a tail resource block after the divider —
  // split it out so it can render as its own "safety intervention" card (task 3),
  // instead of blending into the ordinary reply text.
  const isCrisisSafety = isAI && (m.safety === "crisis" || m.safety === "suicide_concern");
  const delimIdx = isCrisisSafety ? m.content.indexOf(SAFETY_DIVIDER) : -1;
  const mainText = delimIdx >= 0 ? m.content.slice(0, delimIdx).replace(/\s+$/, "") : m.content;
  const interventionText = delimIdx >= 0 ? m.content.slice(delimIdx + SAFETY_DIVIDER.length).replace(/^\s+/, "") : "";
  const canGiveFeedback = isAI && !m.streaming && !m.errored && !!onFeedback;
  return (
    <div className={"msg " + (isAI ? "ai" : "user")}>
      {isAI ? <Avatar size={34} /> : <div className="avatar user-av" aria-hidden="true"><Ic.user style={{ width: 18, height: 18 }} /></div>}
      <div className="msg-body">
        {onDelete && !m.streaming && <MsgDelete lang={lang} onDelete={() => onDelete(m.id)} />}
        <div className="msg-who">
          {isAI ? p.name[lang] : (lang === "zh" ? "你" : "You")}
          {isAI && m.pace && (
            <span style={{ marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 999, border: "1px solid var(--tone, #3a8a78)", color: "var(--tone, #3a8a78)", opacity: 0.75, verticalAlign: "middle" }}>
              {m.pace === "deep" ? STR[lang].pace_deep : STR[lang].pace_fast}
            </span>
          )}
        </div>
        {isCrisisSafety && (
          // Only surface the safety step when the danger check ACTUALLY caught something
          // (e.g. fast-mode parallel judge late-flag). A "✓未见风险" badge on every normal
          // reply made the whole chat feel clinical/monitored — keep it warm by default.
          <div className="safety-flag">
            <Ic.shield />
            <span>{STR[lang].safety_label} · ⚠ {STR[lang].safety_flagged}</span>
          </div>
        )}
        {isAI && m.safety === "gentle" && (
          // Gentle check-in: a quiet "already checked in" marker, never the crisis banner.
          <div className="safety-flag safety-flag-gentle">
            <Ic.shield />
            <span>{STR[lang].safety_label} · {STR[lang].safety_gentle}</span>
          </div>
        )}
        {isAI && m.thinking && m.thinking.trim() && (
          <details className="think-trace" open={!!m.streaming && m.content === ""}>
            <summary>
              <Ic.insight />
              {STR[lang].think_label}{m.streaming && m.content === "" ? "…" : ""}
            </summary>
            <div className="think-body">{m.thinking}</div>
            <div className="think-hint">{STR[lang].think_hint}</div>
          </details>
        )}
        <div className={"bubble" + (hasMedia && !hasText ? " media-only" : "") + (m.errored ? " bubble-error" : "")}>
          {hasMedia && (
            <div className="bubble-media">
              {m.media!.map((md) => md.type === "image"
                ? <img key={md.id} src={md.url} alt={md.name || ""} />
                : <video key={md.id} src={md.url} controls playsInline />)}
            </div>
          )}
          {m.visionPending && <span className="vision-pending">{STR[lang].vision_loading}</span>}
          {hasText && <span className="bubble-text">{mainText}</span>}
          {m.streaming && m.content === "" && <Thinking startedAt={m.startedAt} lang={lang} />}
          {m.streaming && m.content !== "" && <span className="caret" />}
          {m.streaming && m.content !== "" && (
            <span className="stream-progress" aria-hidden="true">
              {/* width tracks REAL arrived characters (asymptotic, no known total) —
                  never a fake countdown/fill; the bar disappears when streaming ends. */}
              <i style={{ width: `${Math.round((1 - Math.exp(-m.content.length / 360)) * 95)}%` }} />
            </span>
          )}
        </div>
        {delimIdx >= 0 && <SafetyIntervention text={interventionText} autoScroll={m.pace === "fast"} />}
        {canGiveFeedback && (
          <div className="msg-feedback" role="group" aria-label={STR[lang].feedback_up + " / " + STR[lang].feedback_down}>
            <button
              className={"fb-btn" + (m.feedback === "up" ? " on" : "")}
              onClick={() => onFeedback!(m.id, "up")}
              aria-pressed={m.feedback === "up"}
              title={STR[lang].feedback_up}
            >
              <Ic.thumbUp /> {STR[lang].feedback_up}
            </button>
            <button
              className={"fb-btn fb-down" + (m.feedback === "down" ? " on" : "")}
              onClick={() => onFeedback!(m.id, "down")}
              aria-pressed={m.feedback === "down"}
              title={STR[lang].feedback_down}
            >
              <Ic.thumbDown /> {STR[lang].feedback_down}
            </button>
          </div>
        )}
        {isAI && m.refs && m.refs.length > 0 && (
          <details className="kb-refs">
            <summary>
              <Ic.clipboard />
              {lang === "zh"
                ? `信息来源 · ${m.refs.length} 条（点开看原文出处）`
                : `Sources · ${m.refs.length} (open to check)`}
            </summary>
            <div className="kb-body">
              <div className="kb-note">
                {lang === "zh"
                  ? "这条回应参考了下面这些权威来源的要点。点链接可核对原文——只用真实、可查证的资料,不替代专业诊疗。"
                  : "This reply drew on the authoritative sources below — open a link to verify the original. We use only real, checkable sources, never a substitute for professional care."}
              </div>
              <ol className="kb-list">
                {m.refs.map((r, i) => (
                  <li key={i} className="kb-item">
                    <div className="kb-title">
                      {r.title}
                      {r.kind === "web" && <span className="kb-live">{lang === "zh" ? "实时" : "live"}</span>}
                    </div>
                    {r.quote && <div className="kb-quote">“{r.quote}”</div>}
                    <div className="kb-meta">
                      {r.source && <span className="kb-source">{r.source}</span>}
                      {r.url && (
                        <a className="kb-link" href={r.url} target="_blank" rel="noopener noreferrer">
                          {lang === "zh" ? "查看来源 ↗" : "View source ↗"}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        )}
        {m.errored && onRetry && (
          <button className="retry-btn" onClick={() => onRetry(m.id)}>
            <Ic.refresh className="retry-ico" /> {STR[lang].retry}
          </button>
        )}
      </div>
    </div>
  );
}

export function Stream({ messages, persona, lang, onRetry, onFeedback, onDelete }: {
  messages: Message[]; persona: Persona; lang: Lang; onRetry?: (id: string) => void;
  onFeedback?: (id: string, verdict: "up" | "down") => void;
  onDelete?: (id: string) => void;
}) {
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
          {messages.map((m) => <Bubble key={m.id} m={m} persona={persona} lang={lang} onRetry={onRetry} onFeedback={onFeedback} onDelete={onDelete} />)}
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

  // Client-side guardrail mirroring the server's 413 (max 4000 chars/message) — warn
  // well before the limit so the user never actually hits the server rejection.
  const MAX_CHARS = 4000;
  const WARN_CHARS = 3800;
  const overLimit = val.length > MAX_CHARS;
  const nearLimit = val.length > WARN_CHARS;
  const canSend = (val.trim() || atts.length > 0) && !busy && !overLimit;
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
      {val.length > 0 && (
        <div
          className={"len-warn" + (overLimit ? " over" : nearLimit ? " warn" : "")}
          role={nearLimit ? "status" : undefined}
        >
          {nearLimit ? `${t.input_too_long}（${val.length}/${MAX_CHARS}）` : `${val.length} / ${MAX_CHARS}`}
        </div>
      )}
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
        <div className="pace-toggle" role="group" aria-label="pace" title={t.pace_hint}>
          <button className={pace === "deep" ? "on" : ""} onClick={() => onPace("deep")} title={t.pace_hint}>{t.pace_deep}</button>
          <button className={pace === "fast" ? "on" : ""} onClick={() => onPace("fast")} title={t.pace_hint}>{t.pace_fast}</button>
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
    </div>
  );
}
