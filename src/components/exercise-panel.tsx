"use client";

import { ClipboardList, SendHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  THERAPY_EXERCISES,
  formatExercisePrompt,
  getExerciseById,
  type ExerciseId
} from "@/lib/exercises";
import type { ConsultGoal } from "@/lib/types";

type ExercisePanelProps = {
  disabled?: boolean;
  initialId?: ExerciseId | null;
  onCancel?: () => void;
  onInsert: (prompt: string, goal: ConsultGoal) => void;
};

export function ExercisePanel({ disabled, initialId, onCancel, onInsert }: ExercisePanelProps) {
  const [activeId, setActiveId] = useState<ExerciseId>(initialId ?? "cbt-thought-record");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const activeExercise = useMemo(() => getExerciseById(activeId), [activeId]);

  useEffect(() => {
    if (!initialId) {
      return;
    }

    setActiveId(initialId);
    setAnswers({});
  }, [initialId]);

  function setAnswer(stepId: string, value: string) {
    setAnswers((current) => ({ ...current, [stepId]: value }));
  }

  function switchExercise(id: ExerciseId) {
    setActiveId(id);
    setAnswers({});
  }

  return (
    <section className="exercise-panel" aria-label="结构化练习">
      <div className="exercise-head">
        <div className="exercise-title">
          <ClipboardList size={16} />
          <span>练习工具</span>
        </div>
        <div className="exercise-head-actions">
          <small>{activeExercise.method}</small>
          {onCancel ? (
            <button type="button" className="icon-button compact" onClick={onCancel} aria-label="收起练习">
              <X size={15} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="exercise-tabs" role="tablist" aria-label="选择练习">
        {THERAPY_EXERCISES.map((exercise) => {
          const isSelected = exercise.id === activeId;
          return (
            <button
              key={exercise.id}
              type="button"
              className={`exercise-tab${isSelected ? " selected" : ""}`}
              role="tab"
              aria-selected={isSelected}
              onClick={() => switchExercise(exercise.id)}
              disabled={disabled}
            >
              {exercise.label}
            </button>
          );
        })}
      </div>

      <p className="exercise-description">{activeExercise.description}</p>

      <div className="exercise-steps">
        {activeExercise.steps.map((step) => (
          <label key={step.id} className="exercise-step">
            <span>{step.label}</span>
            <small>{step.prompt}</small>
            {step.chips ? (
              <div className="exercise-chips">
                {step.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="exercise-chip"
                    onClick={() => {
                      const existing = (answers[step.id] ?? "").trimEnd();
                      setAnswer(step.id, existing ? `${existing}、${chip}` : chip);
                    }}
                    disabled={disabled}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
            <textarea
              value={answers[step.id] ?? ""}
              onChange={(event) => setAnswer(step.id, event.target.value)}
              placeholder={step.placeholder}
              rows={2}
              disabled={disabled}
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        className="exercise-insert"
        onClick={() => onInsert(formatExercisePrompt(activeExercise, answers), activeExercise.goal)}
        disabled={disabled}
      >
        <SendHorizontal size={15} />
        带入对话
      </button>
    </section>
  );
}
