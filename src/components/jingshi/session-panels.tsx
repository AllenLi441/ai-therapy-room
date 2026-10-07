"use client";
import { useState } from "react";
import { Sheet } from "./overlays";
import { Ic } from "./icons";
import { STR, personaById, type AgeRange, type Lang, type Message, type SupportRegion } from "./data";
import type { RecordBackup, SessionRecord } from "./session-state";
import { DONATION_CONSENT_VERSION, type DonationAgeBracket } from "@/lib/donations";
import { redactText } from "@/lib/redact";
import styles from "./session-panels.module.css";

export function SessionSummary({ lang, summary, nextStep, loading, error, saved, onSummary, onNextStep, onRetry, onSave, onNew, onDonate, onClose }: {
  lang: Lang; summary: string; nextStep: string; loading: boolean; error: string | null; saved: boolean;
  onSummary: (value: string) => void; onNextStep: (value: string) => void; onRetry: () => void;
  onSave: () => void; onNew: () => void; onDonate?: () => void; onClose: () => void;
}) {
  const t = STR[lang];
  return <Sheet onClose={onClose} label={t.pause_today}>
    <div className="sheet-head"><h2>{t.pause_today}</h2><button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
    <div className={`sheet-body ${styles.body}`}>
      <p>{t.summary_intro}</p>
      {loading && <p role="status">{t.summary_loading}</p>}
      {error && <div role="alert"><p>{error}</p><button className="btn ghost" onClick={onRetry} disabled={loading}>{t.summary_retry}</button></div>}
      <label className={styles.field}>{t.summary_field}<textarea rows={7} maxLength={4000} value={summary} disabled={loading} onChange={(e) => onSummary(e.target.value)} /></label>
      <label className={styles.field}>{t.next_step_field}<textarea rows={2} maxLength={600} value={nextStep} onChange={(e) => onNextStep(e.target.value)} /></label>
      <p className={styles.note}>{t.summary_note}</p>
      {saved && <p role="status">{t.summary_saved}</p>}
      <div className={styles.actions}><button className="btn" onClick={onSave} disabled={loading || !summary.trim()}>{t.summary_save}</button><button className="btn ghost" onClick={onNew} disabled={loading || !summary.trim()}>{t.summary_save_new}</button>{saved && onDonate && <button className="btn ghost" onClick={onDonate}>{t.donate_button}</button>}</div>
    </div>
  </Sheet>;
}

export function SessionHistory({ lang, sessions, onResume, onDelete, onDonate, onWithdraw, notice, onClose }: {
  lang: Lang; sessions: SessionRecord[]; onResume: (session: SessionRecord) => void; onDelete: (id: string) => void;
  onDonate?: (session: SessionRecord) => void; onWithdraw?: (session: SessionRecord) => void; notice?: string; onClose: () => void;
}) {
  const t = STR[lang];
  const [pending, setPending] = useState<string | null>(null);
  return <Sheet onClose={onClose} label={t.past_sessions}>
    <div className="sheet-head"><h2>{t.past_sessions}</h2><button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
    <div className={`sheet-body ${styles.body}`}>
      <p className={styles.note}>{t.history_note}</p>
      {notice && <p role="status">{notice}</p>}
      {!sessions.length && <p>{t.history_empty}</p>}
      {[...sessions].reverse().map((session) => <article className={styles.record} key={session.id}>
        <h3>{new Date(session.createdAt).toLocaleString(lang === "zh" ? "zh-CN" : lang, { dateStyle: "medium", timeStyle: "short" })}</h3>
        <p className={styles.pre}>{session.summary}</p>
        {session.nextStep && <p><strong>{t.history_next_step}</strong>{session.nextStep}</p>}
        <details><summary>{t.history_read}</summary>{session.messages.map((message) => <p className={styles.pre} key={message.id}><strong>{message.role === "user" ? t.you : personaById("linxi").name[lang]}：</strong>{message.content}</p>)}</details>
        <div className={styles.actions}><button className="btn ghost" onClick={() => onResume(session)}>{t.history_continue}</button><button className="btn ghost" onClick={() => setPending(session.id)}>{t.history_delete}</button>
          {session.donationId ? onWithdraw && <><span className={styles.note}>{t.donate_donated}</span><button className="btn ghost" onClick={() => onWithdraw(session)}>{t.donate_withdraw}</button></> : onDonate && <button className="btn ghost" onClick={() => onDonate(session)}>{t.donate_button}</button>}</div>
        {pending === session.id && <div className={styles.confirm} role="group" aria-label={t.history_confirm_label}><p>{t.history_confirm_q}</p><div className={styles.actions}><button className="btn danger" onClick={() => { onDelete(session.id); setPending(null); }}>{t.history_delete_confirm}</button><button className="btn ghost" onClick={() => setPending(null)}>{t.delete_cancel}</button></div></div>}
      </article>)}
    </div>
  </Sheet>;
}

export function ImportRecords({ lang, backup, onConfirm, onClose }: { lang: Lang; backup: RecordBackup; onConfirm: () => void; onClose: () => void }) {
  const t = STR[lang];
  return <Sheet onClose={onClose} label={t.import_title}>
    <div className="sheet-head"><h2>{t.import_title}</h2></div>
    <div className={`sheet-body ${styles.body}`}><p>{t.import_body.replace("{m}", String(backup.messages.length)).replace("{s}", String(backup.sessions.length))}</p><p>{t.import_local}</p><div className={styles.actions}><button className="btn ghost" onClick={onClose}>{t.delete_cancel}</button><button className="btn" onClick={onConfirm}>{t.import_confirm}</button></div></div>
  </Sheet>;
}

const AGE_CHOICES = ["18+", "14-17", "under-14"] as const;

/** Review and send one saved session: masked preview, per-message opt-out, age (14+ only)
 * and an explicit consent tick. Sessions with a safety intervention are not offered. */
export function DonateSession({ lang, session, ageRange, region, onDonated, onClose }: {
  lang: Lang; session: SessionRecord; ageRange: AgeRange; region: SupportRegion; onDonated: (id: string) => void; onClose: () => void;
}) {
  const t = STR[lang];
  const messages = session.messages.filter((m) => !m.errored && m.content.trim());
  const blocked = session.messages.some((m) => m.safety === "crisis" || m.safety === "suicide_concern");
  const [included, setIncluded] = useState(() => new Set(messages.map((m) => m.id)));
  const [age, setAge] = useState<(typeof AGE_CHOICES)[number] | "">(ageRange === "adult" ? "18+" : "");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const chosen = messages.filter((m) => included.has(m.id));
  const hasOwn = chosen.some((m) => m.role === "user");
  const canSend = !blocked && hasOwn && agreed && (age === "18+" || age === "14-17") && status !== "sending" && status !== "done";
  const ageLabel = { "18+": t.donate_age_adult, "14-17": t.donate_age_teen, "under-14": t.donate_age_child };
  const toggle = (id: string) => setIncluded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function send() {
    if (!canSend) return;
    setStatus("sending");
    try {
      const response = await fetch("/api/donate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chosen.map((m: Message) => ({ role: m.role, content: redactText(m.content), safety: m.safety, pace: m.pace, feedback: m.feedback })),
          ageBracket: age as DonationAgeBracket, language: lang, supportRegion: region, consentVersion: DONATION_CONSENT_VERSION,
        }),
      });
      const data = response.ok ? await response.json() : null;
      if (typeof data?.id !== "string") throw new Error();
      setStatus("done"); onDonated(data.id);
    } catch { setStatus("failed"); }
  }

  return <Sheet onClose={onClose} label={t.donate_title}>
    <div className="sheet-head"><h2>{t.donate_title}</h2><button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
    <div className={`sheet-body ${styles.body}`}>
      {blocked ? <p>{t.donate_crisis}</p> : <>
        <p className={styles.note}>{t.donate_body}</p>
        <fieldset className={styles.field}><legend>{t.donate_age_label}</legend>
          {AGE_CHOICES.map((choice) => <label key={choice}><input type="radio" name="donate-age" checked={age === choice} onChange={() => setAge(choice)} /> {ageLabel[choice]}</label>)}
        </fieldset>
        {age === "under-14" && <p role="status">{t.donate_under14}</p>}
        <fieldset className={styles.field}><legend>{t.donate_messages_label}</legend>
          {messages.map((m) => <label key={m.id} className={styles.pre}><input type="checkbox" checked={included.has(m.id)} onChange={() => toggle(m.id)} /> <strong>{m.role === "user" ? t.you : personaById("linxi").name[lang]}：</strong>{redactText(m.content)}</label>)}
        </fieldset>
        {!hasOwn && <p role="alert">{t.donate_empty}</p>}
        <label><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> {t.donate_consent}</label>
        {status === "done" && <p role="status">{t.donate_done}</p>}
        {status === "failed" && <p role="alert">{t.donate_failed}</p>}
        <div className={styles.actions}><button className="btn" onClick={() => void send()} disabled={!canSend}>{status === "sending" ? t.donate_sending : t.donate_submit}</button><button className="btn ghost" onClick={onClose}>{t.close}</button></div>
      </>}
    </div>
  </Sheet>;
}
