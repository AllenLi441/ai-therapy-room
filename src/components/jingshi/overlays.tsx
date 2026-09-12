"use client";
/* overlays.tsx — Sheet, About, Crisis, Breathing, Scales, CaseDrawer (from design handoff) */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ic } from "./icons";
import { Presence, Avatar } from "./chat-parts";
import { STR, SCALES, SCALE_OPTS, type Lang, type Persona, type SupportRegion, type AgeRange } from "./data";
import { emptyCaseMap, isCaseMapPopulated, type CaseMap, type ScaleResult, type ScaleId } from "@/lib/types";
import { CN_PRIMARY_HOTLINES, INTL_RESOURCES } from "@/lib/crisis-resources";
import { scoreScale } from "@/lib/scales";
import { APP_VERSION } from "@/lib/version";

const modalStack: HTMLElement[] = [];
const backgroundStates = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
let originalOverflow = "";
const subscribeToClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function syncModalBackground() {
  const active = modalStack.at(-1);
  if (!active) {
    for (const [node, prior] of backgroundStates) {
      node.toggleAttribute("inert", prior.inert);
      if (prior.ariaHidden === null) node.removeAttribute("aria-hidden");
      else node.setAttribute("aria-hidden", prior.ariaHidden);
    }
    backgroundStates.clear();
    document.body.style.overflow = originalOverflow;
    return;
  }
  for (const node of Array.from(document.body.children)) {
    if (!(node instanceof HTMLElement)) continue;
    if (!backgroundStates.has(node)) backgroundStates.set(node, { inert: node.hasAttribute("inert"), ariaHidden: node.getAttribute("aria-hidden") });
    const isBackground = node !== active;
    node.toggleAttribute("inert", isBackground);
    if (isBackground) node.setAttribute("aria-hidden", "true");
    else node.removeAttribute("aria-hidden");
  }
  document.body.style.overflow = "hidden";
}

function ModalFrame({ children, onClose, label, className, backdropClassName = "scrim" }: {
  children: ReactNode; onClose?: () => void; label?: string; className: string; backdropClassName?: string;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const titleId = useId();
  const mounted = useSyncExternalStore(subscribeToClient, clientSnapshot, serverSnapshot);
  useEffect(() => {
    if (!mounted || !backdrop.current || !dialog.current) return;
    const root = backdrop.current;
    const panel = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modalStack.length === 0) originalOverflow = document.body.style.overflow;
    modalStack.push(root);
    const heading = panel.querySelector("h2");
    if (!label && heading) { heading.id = titleId; panel.setAttribute("aria-labelledby", titleId); }
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]'))
      .filter((el) => !el.closest('[hidden], [inert], [aria-hidden="true"]') && (!el.closest("details:not([open])") || el.tagName === "SUMMARY"));
    const focusFirst = () => (focusable()[0] ?? panel).focus();
    // Move focus before hiding the background from assistive technology.
    focusFirst();
    syncModalBackground();
    const onKey = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== root) return;
      if (event.key === "Escape" && closeRef.current) { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const onFocus = (event: FocusEvent) => {
      if (modalStack.at(-1) === root && !panel.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus, true);
      const index = modalStack.indexOf(root);
      if (index >= 0) modalStack.splice(index, 1);
      syncModalBackground();
      if (opener?.isConnected && !opener.closest("[inert]")) opener.focus();
    };
  }, [mounted, label, titleId]);
  if (!mounted) return null;
  return createPortal(
    <div ref={backdrop} className={backdropClassName} onClick={() => closeRef.current?.()}>
      <div ref={dialog} tabIndex={-1} className={className} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>, document.body
  );
}

export function Sheet({ children, onClose, className = "", label }: { children: ReactNode; onClose: () => void; className?: string; label?: string }) {
  return <ModalFrame onClose={onClose} label={label} className={"sheet " + className}><div className="sheet-grab" aria-hidden="true" />{children}</ModalFrame>;
}

// A calm confirm dialog reusing the Sheet system — replaces native confirm() so
// the delete flow keeps the design language (and is reachable/testable in-app).
export function ConfirmSheet({ lang, onConfirm, onClose }: { lang: Lang; onConfirm: () => void; onClose: () => void }) {
  const t = STR[lang];
  return (
    <Sheet onClose={onClose} className="confirm-sheet">
      <div className="sheet-head"><div><h2>{t.delete_title}</h2></div>
        <button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
      <div className="sheet-body">
        <p className="confirm-body">{t.delete_body}</p>
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onClose}>{t.delete_cancel}</button>
          <button className="btn danger" onClick={onConfirm}>{t.delete_confirm}</button>
        </div>
      </div>
    </Sheet>
  );
}

// Entry disclaimer + consent. Full-screen, no dismiss — tapping the entry button = agree.
// Four explicit boundary points (own copy, independent of AboutSheet's about_* strings):
// who/what this is, crisis-first guidance (hotline wording pulled from the existing
// safety_tip string, never a hardcoded new number), on-device privacy, and beta status
// + per-turn feedback.
export function ConsentGate({ lang, onAccept, region, onRegionChange, ageRange, onAgeRangeChange }: {
  lang: Lang; onAccept: () => void; region?: SupportRegion; onRegionChange?: (region: SupportRegion) => void;
  ageRange?: AgeRange; onAgeRangeChange?: (age: AgeRange) => void;
}) {
  const t = STR[lang];
  const [localAge, setLocalAge] = useState<AgeRange>("unspecified");
  const selectedAge = ageRange ?? localAge;
  const points = [
    { ico: <Ic.heart />, t: t.consent_p1_t, d: t.consent_p1_d },
    { ico: <Ic.shield />, t: t.consent_p2_t, d: t.support_other_note, warn: true },
    { ico: <Ic.lock />, t: t.consent_p3_t, d: t.consent_p3_d },
    { ico: <Ic.clipboard />, t: t.consent_p4_t, d: t.consent_p4_d }
  ];
  return (
    <ModalFrame backdropClassName="consent-gate" className="consent-card scroll" label={t.consent_title}>
        <div className="consent-hero">
          <Presence size={64} glow breathe />
          <h2>{t.consent_title}</h2>
        </div>
        <div className="about-points">
          {points.map((p, i) => (
            <div key={i} className={"about-point" + (p.warn ? " warn" : "")}>
              <span className="ap-ico">{p.ico}</span>
              <div><h3>{p.t}</h3><p>{p.d}</p></div>
            </div>
          ))}
        </div>
        <label className="support-select"><span>{t.age_label}</span><select value={selectedAge} onChange={(event) => {
          const value = event.target.value as AgeRange; setLocalAge(value); onAgeRangeChange?.(value);
        }}><option value="unspecified">{t.age_unspecified}</option><option value="adult">{t.age_adult}</option><option value="minor">{t.age_minor}</option></select></label>
        {selectedAge === "minor" && <p className="support-note">{t.minor_note}</p>}
        <details className="consent-support"><summary>{t.support_title}</summary><SupportResources lang={lang} region={region} onRegionChange={onRegionChange} /></details>
        <p className="consent-agree">{t.consent_agree}</p>
        <button className="btn solid consent-enter" onClick={onAccept}>{t.consent_enter}</button>
    </ModalFrame>
  );
}

// js_feedback is a plain array of per-turn beta-feedback records (see app.tsx onFeedback).
// Read defensively — corrupt/missing storage just means "no feedback yet".
function readFeedback(): unknown[] {
  try {
    const raw = localStorage.getItem("js_feedback");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function AboutSheet({ lang, companion, onClose, onExportData, onImportData, dataError }: {
  lang: Lang; companion: Persona; onClose: () => void;
  onExportData?: () => void; onImportData?: (file: File) => void; dataError?: string;
}) {
  const t = STR[lang];
  const [exportError, setExportError] = useState(false);
  const points = [
    { ico: <Ic.heart />, t: t.about_honest_t, d: t.about_honest },
    { ico: <Ic.lock />, t: t.about_privacy_t, d: t.about_privacy },
    { ico: <Ic.shield />, t: t.about_safety_t, d: t.about_safety, warn: true }
  ];
  const feedback = readFeedback();
  const exportFeedback = () => {
    try {
      const payload = { appVersion: APP_VERSION, exportedAt: new Date().toISOString(), lang, feedback: readFeedback() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jingshi-feedback-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportError(false);
    } catch { setExportError(true); }
  };
  return (
    <Sheet onClose={onClose} label={t.about_title}>
      <div className="sheet-head" style={{ paddingBottom: 0 }}>
        <div style={{ flex: 1 }} />
        <button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button>
      </div>
      <div className="sheet-body scroll" style={{ paddingTop: 0 }}>
        <div className="about-hero">
          <Presence size={96} glow breathe />
          <h2>{companion.name[lang]}</h2>
          <p>{t.about_who}</p>
        </div>
        <div className="about-points">
          {points.map((p, i) => (
            <div key={i} className={"about-point" + (p.warn ? " warn" : "")}>
              <span className="ap-ico">{p.ico}</span>
              <div><h3>{p.t}</h3><p>{p.d}</p></div>
            </div>
          ))}
        </div>
        <div className="about-voice">
          <h3>{t.about_voice_t}</h3>
          <p>{t.about_voice}</p>
          <div className="about-voice-samples">
            {(t.about_voice_samples as string[]).map((s, i) => (
              <span key={i} className="voice-sample">{`「${s}」`}</span>
            ))}
          </div>
        </div>
        <div className="about-export">
          {(onExportData || onImportData) && <section className="data-backup">
            <h3>{lang === "zh" ? "备份与更换域名" : "Backup and moving to a new domain"}</h3>
            <p>{lang === "zh" ? "不同域名不会自动共享浏览器记录。你可以导出后在新域名导入。文件包含敏感的对话内容，请自行妥善保管，仅在可信设备导入。每段最多保留最近120条消息。原图不包含在记录备份中；历史图片描述可能保留。" : "Browser records do not move automatically between domains. Export them here, then import on the new domain. The file contains sensitive conversations: keep it private and import only on a trusted device. Each conversation keeps up to 120 recent messages. Original images are not included in backups; descriptions of earlier images may be retained."}</p>
            <div className="backup-actions">
              {onExportData && <button className="btn ghost" onClick={onExportData}>{lang === "zh" ? "导出我的记录" : "Export my records"}</button>}
              {onImportData && <label className="backup-file"><span>{lang === "zh" ? "导入记录" : "Import records"}</span><input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportData(file); event.target.value = ""; }} /></label>}
            </div>
            {dataError && <p role="alert">{dataError}</p>}
          </section>}
          <button className="btn ghost export-btn" onClick={exportFeedback} disabled={feedback.length === 0}>
            {t.export_feedback}
          </button>
          <p className="export-note">{t.export_feedback_note}</p>
          {exportError && <p role="alert">{t.feedback_export_failed}</p>}
        </div>
      </div>
    </Sheet>
  );
}

type ResourceProps = { lang: Lang; region?: SupportRegion; onRegionChange?: (region: SupportRegion) => void };

export function SupportResources({ lang, region, onRegionChange }: ResourceProps) {
  const t = STR[lang];
  const [localRegion, setLocalRegion] = useState<SupportRegion>("OTHER");
  const selected = region ?? localRegion;
  const lines: Array<{ num: string; label: string; href: string }> = selected === "CN"
    ? CN_PRIMARY_HOTLINES.map((h) => ({ num: h.number, label: h[lang], href: "tel:" + h.tel }))
    : selected === "US"
      ? [
          { num: INTL_RESOURCES.usCrisis, label: t.h_us988, href: "tel:" + INTL_RESOURCES.usCrisis },
          { num: INTL_RESOURCES.usEmergency, label: lang === "zh" ? "美国紧急服务" : "US emergency services", href: "tel:" + INTL_RESOURCES.usEmergency }
        ]
      : selected === "UK_IE"
        ? [{ num: INTL_RESOURCES.ukSamaritans, label: t.h_samaritans, href: "tel:" + INTL_RESOURCES.ukSamaritans.replace(/\s/g, "") }]
        : [];
  return <section className="support-resources" aria-label={t.support_title}>
    <label className="support-select"><span>{t.support_region}</span><select value={selected} onChange={(event) => {
      const next = event.target.value as SupportRegion; setLocalRegion(next); onRegionChange?.(next);
    }}>
      <option value="OTHER">{t.region_other}</option><option value="CN">{t.region_cn}</option><option value="US">{t.region_us}</option><option value="UK_IE">{t.region_uk}</option>
    </select></label>
    <p className="support-note">{t.support_region_note}</p>
    {selected === "OTHER" && <p className="support-note">{t.support_other_note}</p>}
    <div className="crisis-hotlines" role="group" aria-label={t.hotline_label}>
      {lines.map((line) => <a key={line.num} className="crisis-hotline" href={line.href}><Ic.phone /><span className="ch-num">{line.num}</span><span className="ch-label">{line.label}</span></a>)}
      <a className="crisis-hotline" href={"https://" + INTL_RESOURCES.finder} target="_blank" rel="noopener noreferrer"><span className="ch-label">{t.h_finder} ↗</span></a>
    </div>
  </section>;
}

export function SupportSheet({ lang, onClose, region, onRegionChange }: ResourceProps & { onClose: () => void }) {
  const t = STR[lang];
  return <Sheet onClose={onClose} label={t.support_title}>
    <div className="sheet-head"><div><h2>{t.support_title}</h2><p>{t.support_intro}</p></div><button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
    <div className="sheet-body"><SupportResources lang={lang} region={region} onRegionChange={onRegionChange} /></div>
  </Sheet>;
}

export function CrisisBanner({ lang, onDismiss, region, onRegionChange }: ResourceProps & { onDismiss: () => void }) {
  const t = STR[lang];
  return <div className="crisis-banner">
    <div className="crisis-banner-inner">
      <div className="pulse" aria-hidden="true"><Ic.heart /></div>
      <div className="crisis-banner-text"><b>{t.crisis_banner_t}</b><span className="hide-sm">{t.crisis_banner_s}</span></div>
      <button className="crisis-dismiss" onClick={onDismiss}>{t.crisis_exit}</button>
    </div>
    <SupportResources lang={lang} region={region} onRegionChange={onRegionChange} />
  </div>;
}

// (BreathingSheet + CrisisSheet removed 2026-07-08 — product owner directive: the
// "See support" panel with the breathing exercise / grounding steps and the 1–4
// check-in buttons are gone. Hotlines now live directly in CrisisBanner as tappable
// links, localized by language. crisis-resources.ts stays the single source of truth.)

export function ScalePicker({ lang, onPick, onClose }: { lang: Lang; onPick: (id: string) => void; onClose: () => void }) {
  const t = STR[lang];
  const ids = ["PHQ-9", "GAD-7", "ISI"];
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <div><h2>{t.scales}</h2><p>{t.scales_sub}</p></div>
        <button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button>
      </div>
      <div className="sheet-body">
        <div className="scale-pick-list">
          {ids.map((id) => {
            const S = SCALES[id];
            const title = S.name[lang].split(" · ")[1] || S.name[lang];
            const n = S.items[lang].length;
            return (
              <button key={id} className="scale-pick" onClick={() => onPick(id)}>
                <span className="sp-tag">{id}</span>
                <span className="sp-text">
                  <span className="sp-name">{title}</span>
                  <span className="sp-meta">{n} {t.scale_items_zh} · {t.scale_mins}</span>
                </span>
                <Ic.chev className="sp-arrow" />
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

function ScaleSafetyCheck({ lang, region, onRegionChange }: ResourceProps) {
  const t = STR[lang];
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.scrollIntoView?.({ block: "nearest" }); }, []);
  return <section ref={panel} className="scale-safety-check" aria-label={t.scale_safety_title}>
    <div role="status"><h3>{t.scale_safety_title}</h3><p>{t.scale_safety_note}</p></div>
    <SupportResources lang={lang} region={region} onRegionChange={onRegionChange} />
  </section>;
}

export function ScaleModal({ lang, scaleId, onClose, onComplete, region, onRegionChange }: ResourceProps & { scaleId: string; onClose: () => void; onComplete?: (r: ScaleResult) => void }) {
  const t = STR[lang];
  const S = SCALES[scaleId];
  const opts = SCALE_OPTS[S.opts][lang];
  const items = S.items[lang];
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState<Array<number | null>>(Array(items.length).fill(null));
  const [done, setDone] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const setVal = (v: number) => {
    const a = ans.slice(); a[step] = v; setAns(a);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (step < items.length - 1) advanceTimer.current = setTimeout(() => setStep(step + 1), 220);
  };
  const goStep = (next: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setStep(next);
  };
  const total = ans.reduce<number>((s, v) => s + (v ?? 0), 0);
  const band = S.bands.find((b) => total <= b.max) || S.bands[S.bands.length - 1];
  const maxTotal = items.length * S.maxEach;
  const pct = (total / maxTotal) * 100;
  const allDone = ans.every((v) => v !== null);
  const selfHarmConcern = scaleId === "PHQ-9" && (ans[8] ?? 0) > 0;
  const safetyCheck = selfHarmConcern ? <ScaleSafetyCheck lang={lang} region={region} onRegionChange={onRegionChange} /> : null;

  if (done) {
    const C = 2 * Math.PI * 64;
    return (
      <Sheet onClose={onClose}>
        <div className="sheet-head"><div><h2>{S.name[lang]}</h2></div>
          <button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
        <div className="scale-result">
          <div className="result-ring">
            <svg width="150" height="150">
              <circle cx="75" cy="75" r="64" fill="none" stroke="var(--surface-2)" strokeWidth="11" />
              <circle cx="75" cy="75" r="64" fill="none" stroke="var(--sage)" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (pct / 100) * C} />
            </svg>
            <div className="result-num"><b>{total}</b><span>/ {maxTotal}</span></div>
          </div>
          <div className="result-band">{selfHarmConcern ? t.scale_score_reference : band[lang]}</div>
          {selfHarmConcern ? safetyCheck : <div className="result-desc">{band.desc[lang]}</div>}
          <div className="result-foot">{t.result_foot}</div>
          <div className="scale-nav" style={{ justifyContent: "center", gap: 12 }}>
            <button className="btn ghost" onClick={() => { setAns(Array(items.length).fill(null)); setStep(0); setDone(false); }}>{t.retake}</button>
            <button className="btn solid" onClick={onClose}>{t.done}</button>
          </div>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head"><div><h2 style={{ fontSize: "var(--fs-lg)" }}>{S.name[lang]}</h2><p>{S.intro[lang]}</p></div>
        <button className="icon-btn sheet-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
      <div className="scale-progress"><i style={{ width: (step / items.length) * 100 + "%" }} /></div>
      <div className="scale-q">
        <div className="q-count">{step + 1} / {items.length}</div>
        <div className="q-text" aria-live="polite">{items[step]}</div>
        <div className="scale-opts">
          {opts.map((o, vi) => (
            <button key={vi} className={"scale-opt" + (ans[step] === vi ? " on" : "")} aria-pressed={ans[step] === vi} onClick={() => setVal(vi)}>
              <span className="dot" />{o}
            </button>
          ))}
        </div>
      </div>
      {!done && safetyCheck}
      <div className="scale-nav">
        <button className="btn ghost" disabled={step === 0} style={{ opacity: step === 0 ? .4 : 1 }} onClick={() => goStep(Math.max(0, step - 1))}>{t.prev}</button>
        {step < items.length - 1
          ? <button className="btn ghost" disabled={ans[step] === null} style={{ opacity: ans[step] === null ? .4 : 1 }} onClick={() => goStep(step + 1)}>{t.next}</button>
          : <button className="btn solid" disabled={!allDone} onClick={() => {
              // Score via the canonical lib/scales.ts scoreScale (single source of
              // truth — no duplicate inline cutoffs). answers carry the PHQ-9
              // self-harm item the safety layer reads.
              const result = scoreScale(scaleId as ScaleId, ans.map((v) => v ?? 0));
              if (result) onComplete?.(result);
              setDone(true);
            }}>{t.finish}</button>}
      </div>
    </Sheet>
  );
}

export function CaseDrawer({ lang, caseMap, loading, onClose, error, notice, onRetry, onChange }: {
  lang: Lang; caseMap?: CaseMap | null; loading?: boolean; onClose: () => void;
  error?: string | null; notice?: string | null; onRetry?: () => void; onChange?: (map: CaseMap) => void;
}) {
  const t = STR[lang];
  const populated = isCaseMapPopulated(caseMap);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CaseMap>(() => caseMap ?? emptyCaseMap());
  const fields = [
    { key: "presenting" as const, label: t.case_main },
    { key: "triggers" as const, label: t.case_trigger },
    { key: "workingHypothesis" as const, label: t.case_hyp },
    { key: "resources" as const, label: t.case_strength }
  ];
  const startEdit = () => { setDraft(caseMap ?? emptyCaseMap()); setEditing(true); };
  return <ModalFrame className="case-drawer" label={t.case_title} onClose={onClose} backdropClassName="scrim case-scrim">
    <div className="case-head"><Avatar size={32} /><h2>{t.case_title}</h2><button className="icon-btn case-x" onClick={onClose} aria-label={t.close}><Ic.close /></button></div>
    <div className="case-body scroll">
      {notice && <div className="case-note"><p>{notice}</p>{onRetry && <button className="btn ghost" onClick={onRetry} disabled={loading}>{lang === "zh" ? "重新整理" : "Update understanding"}</button>}</div>}
      {error && <div className="case-error" role="alert"><p>{error}</p>{onRetry && <button className="btn ghost" onClick={onRetry} disabled={loading}>{t.retry}</button>}</div>}
      {loading ? <div className="case-note" role="status">{t.case_loading}</div> : editing ? <form className="case-edit" onSubmit={(event) => {
        event.preventDefault(); onChange?.({ ...draft, presenting: draft.presenting.trim(), workingHypothesis: draft.workingHypothesis.trim(), triggers: draft.triggers.map((value) => value.trim()).filter(Boolean).slice(0, 12), resources: draft.resources.map((value) => value.trim()).filter(Boolean).slice(0, 12), updatedAt: new Date().toISOString() }); setEditing(false);
      }}>
        <p className="case-note">{lang === "zh" ? "你可以修正不准确的内容，或留空删除。多条触发因素和力量请各写一行。保存后的理解会用于后续对话。" : "Correct anything inaccurate, or leave it blank to remove it. Use one line per trigger or strength. Your saved understanding will inform future conversations."}</p>
        {fields.map(({ key, label }) => <label key={key}><span>{label}</span><textarea rows={3} maxLength={1800} value={Array.isArray(draft[key]) ? (draft[key] as string[]).join("\n") : draft[key] as string} onChange={(event) => {
          const value = event.target.value; setDraft((prior) => ({ ...prior, [key]: key === "triggers" || key === "resources" ? value.split("\n") : value }));
        }} /></label>)}
        <div className="case-actions"><button className="btn solid" type="submit">{lang === "zh" ? "保存修改" : "Save changes"}</button><button className="btn ghost" type="button" onClick={() => setEditing(false)}>{t.delete_cancel}</button></div>
      </form> : !populated ? <div className="case-note">{t.case_empty}</div> : <>
        <div className="case-note">{t.case_note}</div>
        {caseMap!.presenting && <div className="case-sec"><h3>{t.case_main}</h3><p>{caseMap!.presenting}</p></div>}
        {caseMap!.triggers.length > 0 && <div className="case-sec"><h3>{t.case_trigger}</h3><div className="case-tags">{caseMap!.triggers.map((x, i) => <span className="case-tag" key={i}>{x}</span>)}</div></div>}
        {caseMap!.workingHypothesis && <div className="case-sec"><h3>{t.case_hyp}</h3><p className="case-hyp">{caseMap!.workingHypothesis}</p></div>}
        {caseMap!.resources.length > 0 && <div className="case-sec"><h3>{t.case_strength}</h3><div className="case-tags">{caseMap!.resources.map((x, i) => <span className="case-tag" key={i}>{x}</span>)}</div></div>}
      </>}
      {onChange && !editing && !loading && <div className="case-actions"><button className="btn ghost" onClick={startEdit}>{lang === "zh" ? "修正我的理解" : "Edit this understanding"}</button>{populated && <button className="btn ghost" onClick={() => onChange(emptyCaseMap())}>{lang === "zh" ? "清空理解" : "Clear understanding"}</button>}</div>}
    </div>
  </ModalFrame>;
}
