"use client";
import { useState } from "react";
import { Sheet } from "./overlays";
import { Ic } from "./icons";
import { STR, personaById, type Lang } from "./data";
import type { RecordBackup, SessionRecord } from "./session-state";
import styles from "./session-panels.module.css";

export function SessionSummary({ lang, summary, nextStep, loading, error, saved, onSummary, onNextStep, onRetry, onSave, onNew, onClose }: {
  lang: Lang; summary: string; nextStep: string; loading: boolean; error: string | null; saved: boolean;
  onSummary: (value: string) => void; onNextStep: (value: string) => void; onRetry: () => void;
  onSave: () => void; onNew: () => void; onClose: () => void;
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
      <div className={styles.actions}><button className="btn" onClick={onSave} disabled={loading || !summary.trim()}>{t.summary_save}</button><button className="btn ghost" onClick={onNew} disabled={loading || !summary.trim()}>{t.summary_save_new}</button></div>
    </div>
  </Sheet>;
}

export function SessionHistory({ lang, sessions, onResume, onDelete, onClose }: {
  lang: Lang; sessions: SessionRecord[]; onResume: (session: SessionRecord) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const t = STR[lang];
  const [pending, setPending] = useState<string | null>(null);
  return <Sheet onClose={onClose} label={t.past_sessions}>
    <div className="sheet-head"><h2>{t.past_sessions}</h2><button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
    <div className={`sheet-body ${styles.body}`}>
      <p className={styles.note}>{t.history_note}</p>
      {!sessions.length && <p>{t.history_empty}</p>}
      {[...sessions].reverse().map((session) => <article className={styles.record} key={session.id}>
        <h3>{new Date(session.createdAt).toLocaleString(lang === "zh" ? "zh-CN" : lang, { dateStyle: "medium", timeStyle: "short" })}</h3>
        <p className={styles.pre}>{session.summary}</p>
        {session.nextStep && <p><strong>{t.history_next_step}</strong>{session.nextStep}</p>}
        <details><summary>{t.history_read}</summary>{session.messages.map((message) => <p className={styles.pre} key={message.id}><strong>{message.role === "user" ? t.you : personaById("linxi").name[lang]}：</strong>{message.content}</p>)}</details>
        <div className={styles.actions}><button className="btn ghost" onClick={() => onResume(session)}>{t.history_continue}</button><button className="btn ghost" onClick={() => setPending(session.id)}>{t.history_delete}</button></div>
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
