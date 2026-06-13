"use client";

import { Brain, MessageSquareText, ShieldCheck } from "lucide-react";

export type PipelineStep = "idle" | "planning" | "generating" | "reviewing" | "done";
export type PipelineMode = "fast" | "deep";

const STEPS_DEEP = [
  { id: "planning" as const, label: "概念化", icon: Brain },
  { id: "generating" as const, label: "生成回应", icon: MessageSquareText },
  { id: "reviewing" as const, label: "审校", icon: ShieldCheck }
];

const STEPS_FAST = STEPS_DEEP.slice(0, 2);

function stepIndex(step: PipelineStep, mode: PipelineMode) {
  const steps = mode === "deep" ? STEPS_DEEP : STEPS_FAST;
  const idx = steps.findIndex((s) => s.id === step);
  return idx === -1 ? (step === "done" ? steps.length : -1) : idx;
}

export function PipelineBar({
  step,
  mode,
}: {
  step: PipelineStep;
  mode: PipelineMode;
}) {
  if (step === "idle") return null;

  const steps = mode === "deep" ? STEPS_DEEP : STEPS_FAST;
  const current = stepIndex(step, mode);

  return (
    <div className="pipeline-bar" role="progressbar" aria-valuenow={current} aria-valuemax={steps.length}>
      <div className="pipeline-track">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current && step !== "done";
          const Icon = s.icon;

          return (
            <div
              key={s.id}
              className={`pipeline-step${done ? " done" : ""}${active ? " active" : ""}`}
            >
              <div className="pipeline-dot">
                <Icon size={13} />
              </div>
              <span className="pipeline-label">{s.label}</span>
              {i < steps.length - 1 ? <div className={`pipeline-connector${done ? " done" : ""}`} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ModeToggle({
  mode,
  onChange,
  disabled
}: {
  mode: PipelineMode;
  onChange: (mode: PipelineMode) => void;
  disabled: boolean;
}) {
  return (
    <div className="mode-toggle" role="radiogroup" aria-label="回应模式">
      <button
        type="button"
        className={`mode-btn${mode === "fast" ? " selected" : ""}`}
        role="radio"
        aria-checked={mode === "fast"}
        onClick={() => onChange("fast")}
        disabled={disabled}
      >
        快速
      </button>
      <button
        type="button"
        className={`mode-btn${mode === "deep" ? " selected" : ""}`}
        role="radio"
        aria-checked={mode === "deep"}
        onClick={() => onChange("deep")}
        disabled={disabled}
      >
        深度
      </button>
    </div>
  );
}
