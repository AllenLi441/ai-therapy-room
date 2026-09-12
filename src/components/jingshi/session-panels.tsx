"use client";
import { useState } from "react";
import { Sheet } from "./overlays";
import { Ic } from "./icons";
import type { Lang } from "./data";
import type { RecordBackup, SessionRecord } from "./session-state";
import styles from "./session-panels.module.css";

export function SessionSummary({ lang, summary, nextStep, loading, error, saved, onSummary, onNextStep, onRetry, onSave, onNew, onClose }: {
  lang: Lang; summary: string; nextStep: string; loading: boolean; error: string | null; saved: boolean;
  onSummary: (value: string) => void; onNextStep: (value: string) => void; onRetry: () => void;
  onSave: () => void; onNew: () => void; onClose: () => void;
}) {
  const zh = lang === "zh";
  return <Sheet onClose={onClose} label={zh ? "今天先到这里" : "Pause for today"}>
    <div className="sheet-head"><h2>{zh ? "今天先到这里" : "Pause for today"}</h2><button className="icon-btn sheet-x" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><Ic.close /></button></div>
    <div className={`sheet-body ${styles.body}`}>
      <p>{zh ? "留下一点你愿意带走的东西。小结可以修改，也可以只写自己的话。" : "Keep what matters to you. Edit this note, or write it in your own words."}</p>
      {loading && <p role="status">{zh ? "正在回顾这段对话…" : "Looking back over this conversation…"}</p>}
      {error && <div role="alert"><p>{error}</p><button className="btn ghost" onClick={onRetry} disabled={loading}>{zh ? "重新生成" : "Try again"}</button></div>}
      <label className={styles.field}>{zh ? "这次想记下的" : "What I want to remember"}<textarea rows={7} maxLength={4000} value={summary} disabled={loading} onChange={(e) => onSummary(e.target.value)} /></label>
      <label className={styles.field}>{zh ? "我愿意试的一小步（可不填）" : "One step I choose (optional)"}<textarea rows={2} maxLength={600} value={nextStep} onChange={(e) => onNextStep(e.target.value)} /></label>
      <p className={styles.note}>{zh ? "只保存在此浏览器，可在「往次记录」里接着聊或删除。小结可能有误，以你的理解为准。" : "Saved in this browser. Revisit or delete it in Past conversations. This note can be wrong; your view comes first."}</p>
      {saved && <p role="status">{zh ? "已保存。下次可以从往次记录接着聊。" : "Saved. You can continue from Past conversations."}</p>}
      <div className={styles.actions}><button className="btn" onClick={onSave} disabled={loading || !summary.trim()}>{zh ? "保存小结" : "Save note"}</button><button className="btn ghost" onClick={onNew} disabled={loading || !summary.trim()}>{zh ? "保存并开始新对话" : "Save and start fresh"}</button></div>
    </div>
  </Sheet>;
}

export function SessionHistory({ lang, sessions, onResume, onDelete, onClose }: {
  lang: Lang; sessions: SessionRecord[]; onResume: (session: SessionRecord) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const zh = lang === "zh";
  const [pending, setPending] = useState<string | null>(null);
  return <Sheet onClose={onClose} label={zh ? "往次记录" : "Past conversations"}>
    <div className="sheet-head"><h2>{zh ? "往次记录" : "Past conversations"}</h2><button className="icon-btn sheet-x" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><Ic.close /></button></div>
    <div className={`sheet-body ${styles.body}`}>
      <p className={styles.note}>{zh ? "最多保留最近20段已保存的小结与对话。继续某段对话会替换当前打开的对话，请先保存当前小结。" : "Keeps up to 20 saved conversations. Continuing one replaces the open conversation; save your current note first."}</p>
      {!sessions.length && <p>{zh ? "还没有往次记录。在对话后选择「今天先到这里」即可保存。" : "No saved conversations yet. Choose Pause for today after a chat."}</p>}
      {[...sessions].reverse().map((session) => <article className={styles.record} key={session.id}>
        <h3>{new Date(session.createdAt).toLocaleString(zh ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" })}</h3>
        <p className={styles.pre}>{session.summary}</p>
        {session.nextStep && <p><strong>{zh ? "自选的一小步：" : "My next step: "}</strong>{session.nextStep}</p>}
        <details><summary>{zh ? "查看这段对话" : "Read this conversation"}</summary>{session.messages.map((message) => <p className={styles.pre} key={message.id}><strong>{message.role === "user" ? (zh ? "你" : "You") : (zh ? "安屿" : "Anyu")}：</strong>{message.content}</p>)}</details>
        <div className={styles.actions}><button className="btn ghost" onClick={() => onResume(session)}>{zh ? "接着这段聊" : "Continue this conversation"}</button><button className="btn ghost" onClick={() => setPending(session.id)}>{zh ? "删除这段记录" : "Delete this record"}</button></div>
        {pending === session.id && <div className={styles.confirm} role="group" aria-label={zh ? "确认删除记录" : "Confirm deletion"}><p>{zh ? "删除这段已保存的记录？此操作无法撤销。" : "Delete this saved record? This cannot be undone."}</p><div className={styles.actions}><button className="btn danger" onClick={() => { onDelete(session.id); setPending(null); }}>{zh ? "确认删除" : "Delete record"}</button><button className="btn ghost" onClick={() => setPending(null)}>{zh ? "取消" : "Cancel"}</button></div></div>}
      </article>)}
    </div>
  </Sheet>;
}

export function ImportRecords({ lang, backup, onConfirm, onClose }: { lang: Lang; backup: RecordBackup; onConfirm: () => void; onClose: () => void }) {
  const zh = lang === "zh";
  return <Sheet onClose={onClose} label={zh ? "导入记录" : "Import records"}>
    <div className="sheet-head"><h2>{zh ? "导入记录" : "Import records"}</h2></div>
    <div className={`sheet-body ${styles.body}`}><p>{zh ? `文件包含当前对话${backup.messages.length}条消息、${backup.sessions.length}段往次记录。导入会替换此浏览器现有对话和往次记录，请先导出需要保留的内容。` : `This file contains ${backup.messages.length} messages and ${backup.sessions.length} saved conversations. Import replaces this browser's current and saved conversations. Export anything you want to keep first.`}</p><p>{zh ? "文件仅在本机读取；之后继续聊天时，相关对话内容会发送到服务端处理。" : "The file is read locally. Relevant conversation content will be sent to the service when you continue chatting."}</p><div className={styles.actions}><button className="btn ghost" onClick={onClose}>{zh ? "取消" : "Cancel"}</button><button className="btn" onClick={onConfirm}>{zh ? "替换并导入" : "Replace and import"}</button></div></div>
  </Sheet>;
}
