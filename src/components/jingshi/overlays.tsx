"use client";
/* overlays.tsx — Sheet, About, Crisis, Breathing, Scales, CaseDrawer (from design handoff) */
import { useEffect, useState, type ReactNode } from "react";
import { Ic } from "./icons";
import { Presence, Avatar } from "./chat-parts";
import { STR, SCALES, SCALE_OPTS, type Lang, type Persona } from "./data";
import { isCaseMapPopulated, type CaseMap, type ScaleResult, type ScaleId } from "@/lib/types";
import { scoreScale } from "@/lib/scales";

export function Sheet({ children, onClose, className = "" }: { children: ReactNode; onClose: () => void; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={"sheet " + className} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-grab" />
        {children}
      </div>
    </div>
  );
}

// A calm confirm dialog reusing the Sheet system — replaces native confirm() so
// the delete flow keeps the design language (and is reachable/testable in-app).
export function ConfirmSheet({ lang, onConfirm, onClose }: { lang: Lang; onConfirm: () => void; onClose: () => void }) {
  const t = STR[lang];
  return (
    <Sheet onClose={onClose} className="confirm-sheet">
      <div className="sheet-head"><div><h2>{t.delete_title}</h2></div>
        <button className="icon-btn sheet-x" onClick={onClose} aria-label="close"><Ic.close /></button></div>
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

// Entry disclaimer + consent. Full-screen, no dismiss — tapping 进入 = agree.
// Reuses the same boundary points as AboutSheet so the copy is identical.
export function ConsentGate({ lang, onAccept }: { lang: Lang; onAccept: () => void }) {
  const t = STR[lang];
  const points = [
    { ico: <Ic.heart />, t: t.about_honest_t, d: t.about_honest },
    { ico: <Ic.lock />, t: t.about_privacy_t, d: t.about_privacy },
    { ico: <Ic.shield />, t: t.about_safety_t, d: t.about_safety, warn: true }
  ];
  return (
    <div className="consent-gate" role="dialog" aria-modal="true" aria-label={t.consent_title}>
      <div className="consent-card scroll">
        <div className="consent-hero">
          <Presence size={64} glow breathe />
          <h2>{t.consent_title}</h2>
        </div>
        <div className="about-points">
          {points.map((p, i) => (
            <div key={i} className={"about-point" + (p.warn ? " warn" : "")}>
              <span className="ap-ico">{p.ico}</span>
              <div><h4>{p.t}</h4><p>{p.d}</p></div>
            </div>
          ))}
        </div>
        <p className="consent-agree">{t.consent_agree}</p>
        <button className="btn solid consent-enter" onClick={onAccept}>{t.consent_enter}</button>
      </div>
    </div>
  );
}

export function AboutSheet({ lang, companion, onClose }: { lang: Lang; companion: Persona; onClose: () => void }) {
  const t = STR[lang];
  const points = [
    { ico: <Ic.heart />, t: t.about_honest_t, d: t.about_honest },
    { ico: <Ic.lock />, t: t.about_privacy_t, d: t.about_privacy },
    { ico: <Ic.shield />, t: t.about_safety_t, d: t.about_safety, warn: true }
  ];
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head" style={{ paddingBottom: 0 }}>
        <div style={{ flex: 1 }} />
        <button className="icon-btn sheet-x" onClick={onClose} aria-label="close"><Ic.close /></button>
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
              <div><h4>{p.t}</h4><p>{p.d}</p></div>
            </div>
          ))}
        </div>
        <div className="about-voice">
          <h4>{t.about_voice_t}</h4>
          <p>{t.about_voice}</p>
          <div className="about-voice-samples">
            {(t.about_voice_samples as string[]).map((s, i) => (
              <span key={i} className="voice-sample">{`「${s}」`}</span>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export function CrisisBanner({ lang, onOpen, onDismiss }: { lang: Lang; onOpen: () => void; onDismiss: () => void }) {
  const t = STR[lang];
  return (
    <div className="crisis-banner">
      <div className="crisis-banner-inner">
        <div className="pulse"><Ic.heart /></div>
        <div className="crisis-banner-text">
          <b>{t.crisis_banner_t}</b>
          <span className="hide-sm">{t.crisis_banner_s}</span>
        </div>
        <button className="open-btn" onClick={onOpen}>{t.crisis_open}</button>
        {/* explicit one-click exit — the user can always leave safety mode */}
        <button className="crisis-dismiss" onClick={onDismiss} title={t.crisis_exit}>{t.crisis_exit}</button>
      </div>
    </div>
  );
}

export function CrisisSheet({ lang, onClose, onBreathe }: { lang: Lang; onClose: () => void; onBreathe: () => void }) {
  const t = STR[lang];
  const lines = [
    { num: "12356", label: t.h_psy, ico: <Ic.heart />, primary: true, tel: "12356" },
    { num: "110", label: t.h_police, ico: <Ic.shield />, tel: "110" },
    { num: "120", label: t.h_med, ico: <Ic.phone />, tel: "120" }
  ];
  const steps = [t.safety_1, t.safety_2, t.safety_3, t.safety_4];
  return (
    <Sheet onClose={onClose} className="crisis-sheet">
      <div className="sheet-head">
        <div><h2>{t.crisis_title}</h2></div>
        <button className="icon-btn sheet-x" onClick={onClose} aria-label="close"><Ic.close /></button>
      </div>
      <div className="real-human"><b>{t.real_human}</b></div>
      <div className="sheet-body scroll" style={{ paddingTop: 0 }}>
        <h3 style={{ fontSize: "var(--fs-sm)", color: "var(--ink-2)", margin: "4px 0 10px", fontWeight: 600 }}>{t.hotline_label}</h3>
        <div className="hotline-list" style={{ padding: 0 }}>
          {lines.map((l) => (
            <a key={l.num} className={"hotline" + (l.primary ? " primary" : "")} href={"tel:" + l.tel}>
              <div className="h-ico">{l.ico}</div>
              <div className="h-text"><div className="h-num">{l.num}</div><div className="h-sub">{l.label}</div></div>
              <span className="h-call">{lang === "zh" ? "拨打" : "Call"}</span>
            </a>
          ))}
          <a className="hotline" href="tel:" onClick={(e) => e.preventDefault()}>
            <div className="h-ico"><Ic.user /></div>
            <div className="h-text"><div className="h-num" style={{ fontSize: "var(--fs-md)" }}>{t.emergency_contact}</div><div className="h-sub">{t.emergency_contact_d}</div></div>
            <span className="h-call">{lang === "zh" ? "联系" : "Reach"}</span>
          </a>
        </div>
        <div className="safety-steps">
          <h3>{t.safety_title}</h3>
          {steps.map((s: string, i: number) => (
            <div className="safety-step" key={i}>
              <span className="s-n">{i === 0 ? <Ic.hand style={{ width: 14, height: 14 }} /> : i + 1}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 0 4px" }}>
          <button className="btn solid" style={{ width: "100%" }} onClick={onBreathe}>{t.calm_breathe}</button>
        </div>
      </div>
    </Sheet>
  );
}

export function BreathingSheet({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = STR[lang];
  const phases = [
    { k: "in", label: t.breathe_in, ms: 4000 },
    { k: "hold", label: t.breathe_hold, ms: 2000 },
    { k: "out", label: t.breathe_out, ms: 6000 }
  ];
  const [pi, setPi] = useState(0);
  const [cycles, setCycles] = useState(0);
  useEffect(() => {
    const ph = phases[pi];
    const tm = setTimeout(() => {
      const next = (pi + 1) % phases.length;
      if (next === 0) setCycles((c) => c + 1);
      setPi(next);
    }, ph.ms);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pi]);
  const ph = phases[pi];
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head"><div><h2>{t.breathing}</h2></div>
        <button className="icon-btn sheet-x" onClick={onClose} aria-label="close"><Ic.close /></button></div>
      <div className="breath-stage">
        <div className={"breath-orb " + ph.k}>{ph.label}</div>
        <div className="breath-phase">{cycles >= 3 ? t.breathe_done : `${ph.label} · ${Math.round(ph.ms / 1000)}″`}</div>
      </div>
    </Sheet>
  );
}

export function ScalePicker({ lang, onPick, onClose }: { lang: Lang; onPick: (id: string) => void; onClose: () => void }) {
  const t = STR[lang];
  const ids = ["PHQ-9", "GAD-7", "ISI"];
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-head">
        <div><h2>{t.scales}</h2><p>{t.scales_sub}</p></div>
        <button className="icon-btn sheet-x" onClick={onClose} aria-label="close"><Ic.close /></button>
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

export function ScaleModal({ lang, scaleId, onClose, onComplete }: { lang: Lang; scaleId: string; onClose: () => void; onComplete?: (r: ScaleResult) => void }) {
  const t = STR[lang];
  const S = SCALES[scaleId];
  const opts = SCALE_OPTS[S.opts][lang];
  const items = S.items[lang];
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState<Array<number | null>>(Array(items.length).fill(null));
  const [done, setDone] = useState(false);

  const setVal = (v: number) => {
    const a = ans.slice(); a[step] = v; setAns(a);
    if (step < items.length - 1) setTimeout(() => setStep(step + 1), 220);
  };
  const total = ans.reduce<number>((s, v) => s + (v ?? 0), 0);
  const band = S.bands.find((b) => total <= b.max) || S.bands[S.bands.length - 1];
  const maxTotal = items.length * S.maxEach;
  const pct = (total / maxTotal) * 100;
  const allDone = ans.every((v) => v !== null);

  if (done) {
    const C = 2 * Math.PI * 64;
    return (
      <Sheet onClose={onClose}>
        <div className="sheet-head"><div><h2>{S.name[lang]}</h2></div>
          <button className="icon-btn sheet-x" onClick={onClose} aria-label="close"><Ic.close /></button></div>
        <div className="scale-result">
          <div className="result-ring">
            <svg width="150" height="150">
              <circle cx="75" cy="75" r="64" fill="none" stroke="var(--surface-2)" strokeWidth="11" />
              <circle cx="75" cy="75" r="64" fill="none" stroke="var(--sage)" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (pct / 100) * C} />
            </svg>
            <div className="result-num"><b>{total}</b><span>/ {maxTotal}</span></div>
          </div>
          <div className="result-band">{band[lang]}</div>
          <div className="result-desc">{band.desc[lang]}</div>
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
        <button className="icon-btn sheet-x" onClick={onClose} aria-label="close"><Ic.close /></button></div>
      <div className="scale-progress"><i style={{ width: (step / items.length) * 100 + "%" }} /></div>
      <div className="scale-q">
        <div className="q-count">{step + 1} / {items.length}</div>
        <div className="q-text">{items[step]}</div>
        <div className="scale-opts">
          {opts.map((o, vi) => (
            <button key={vi} className={"scale-opt" + (ans[step] === vi ? " on" : "")} onClick={() => setVal(vi)}>
              <span className="dot" />{o}
            </button>
          ))}
        </div>
      </div>
      <div className="scale-nav">
        <button className="btn ghost" disabled={step === 0} style={{ opacity: step === 0 ? .4 : 1 }} onClick={() => setStep(Math.max(0, step - 1))}>{t.prev}</button>
        {step < items.length - 1
          ? <button className="btn ghost" disabled={ans[step] === null} style={{ opacity: ans[step] === null ? .4 : 1 }} onClick={() => setStep(step + 1)}>{t.next}</button>
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

export function CaseDrawer({ lang, caseMap, loading, onClose }: { lang: Lang; caseMap?: CaseMap | null; loading?: boolean; onClose: () => void }) {
  const t = STR[lang];
  // Real, conversation-derived understanding (from /api/plan). When too little has
  // been said the map is empty — show an HONEST empty state, never canned text.
  const populated = isCaseMapPopulated(caseMap);
  return (
    <div className="scrim" onClick={onClose} style={{ justifyContent: "flex-end", alignItems: "stretch" }}>
      <aside className="case-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="case-head">
          <Avatar size={32} />
          <h2>{t.case_title}</h2>
          <button className="icon-btn case-x" onClick={onClose} aria-label="close"><Ic.close /></button>
        </div>
        <div className="case-body scroll">
          {loading ? (
            <div className="case-note">{t.case_loading}</div>
          ) : !populated ? (
            <div className="case-note">{t.case_empty}</div>
          ) : (
            <>
              <div className="case-note">{t.case_note}</div>
              {caseMap!.presenting && <div className="case-sec"><h3>{t.case_main}</h3><p>{caseMap!.presenting}</p></div>}
              {caseMap!.triggers.length > 0 && <div className="case-sec"><h3>{t.case_trigger}</h3><div className="case-tags">{caseMap!.triggers.map((x) => <span className="case-tag" key={x}>{x}</span>)}</div></div>}
              {caseMap!.workingHypothesis && <div className="case-sec"><h3>{t.case_hyp}</h3><p className="case-hyp">{caseMap!.workingHypothesis}</p></div>}
              {caseMap!.resources.length > 0 && <div className="case-sec"><h3>{t.case_strength}</h3><div className="case-tags">{caseMap!.resources.map((x) => <span className="case-tag" key={x}>{x}</span>)}</div></div>}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
