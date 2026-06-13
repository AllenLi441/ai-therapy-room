"use client";

import { Brain, ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { CaseMap, ScaleResult, TurnPlan } from "@/lib/types";
import { isCaseMapPopulated } from "@/lib/types";

const MODALITY_LABEL: Record<TurnPlan["modality"], string> = {
  "person-centered": "人本倾听",
  CBT: "认知行为（CBT）",
  ACT: "接纳承诺（ACT）",
  DBT: "辩证行为（DBT）",
  MI: "动机式访谈（MI）",
  "trauma-informed": "创伤知情",
  crisis: "危机稳定化"
};

const TX_VIEW_KEY = "quiet-room-therapist-view";

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="case-row">
      <div className="case-row-label">{label}</div>
      <div className="case-chips">
        {items.map((item) => (
          <span key={`${label}-${item}`} className="case-chip">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CasePanel({
  caseMap,
  turnPlan,
  scales,
  planning
}: {
  caseMap: CaseMap;
  turnPlan: TurnPlan | null;
  scales: ScaleResult[];
  planning: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [therapistView, setTherapistView] = useState(true);
  const populated = isCaseMapPopulated(caseMap);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TX_VIEW_KEY);
      if (stored === "off") setTherapistView(false);
      else if (stored === "on") setTherapistView(true);
    } catch {
      // ignore
    }
  }, []);

  function toggleTherapistView() {
    setTherapistView((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(TX_VIEW_KEY, next ? "on" : "off");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <section className="case-panel" aria-label="个案理解">
      <div className="case-panel-toolbar">
        <button
          type="button"
          className="case-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="case-title">
            <Brain size={16} />
            个案理解
            {planning ? <span className="case-status">正在概念化…</span> : null}
          </span>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {open && populated ? (
          <button
            type="button"
            className="case-eye"
            onClick={toggleTherapistView}
            title={therapistView ? "暂时隐藏概念化（看到核心信念可能反向自责）" : "展开治疗师视图"}
            aria-pressed={therapistView}
          >
            {therapistView ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="case-body">
          {!populated && !planning ? (
            <p className="case-empty">
              第一轮咨询会先听你说，之后这里会出现根据对话建立的工作假设、诱发情境、自动想法等。
            </p>
          ) : null}

          {turnPlan ? (
            <div className="case-turn">
              <div className="case-row-label">本轮取向</div>
              <div className="case-modality">{MODALITY_LABEL[turnPlan.modality]}</div>
              {turnPlan.protocolStep ? (
                <div className="case-protocol">{turnPlan.protocolStep}</div>
              ) : null}
            </div>
          ) : null}

          {!therapistView && populated ? (
            <p className="case-empty">
              已暂时隐藏个案概念化字段。如果看见「核心信念」等条目让你反过来质疑自己，可以保持隐藏；想看时再点上方眼睛图标。
            </p>
          ) : (
            <>
              {caseMap.presenting ? (
                <div className="case-row">
                  <div className="case-row-label">主诉</div>
                  <p>{caseMap.presenting}</p>
                </div>
              ) : null}

              {caseMap.workingHypothesis ? (
                <div className="case-row">
                  <div className="case-row-label">工作假设</div>
                  <p>{caseMap.workingHypothesis}</p>
                </div>
              ) : null}

              <ChipRow label="诱发情境" items={caseMap.triggers} />
              <ChipRow label="自动想法" items={caseMap.automaticThoughts} />
              <ChipRow label="核心信念" items={caseMap.coreBeliefs} />
              <ChipRow label="身体反应" items={caseMap.bodyResponses} />
              <ChipRow label="行为模式" items={caseMap.behaviors} />
              <ChipRow label="需要/价值" items={caseMap.needsValues} />
              <ChipRow label="资源" items={caseMap.resources} />
            </>
          )}

          {scales.length > 0 ? (
            <div className="case-row">
              <div className="case-row-label">量表</div>
              <div className="case-scales">
                {scales.slice(-3).map((scale) => (
                  <span key={`${scale.id}-${scale.completedAt}`} className="case-scale">
                    {scale.id} {scale.total}（{scale.severity}）
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
