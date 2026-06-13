"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SCALES, getScaleById, localizeScale, localizedFunctionalOptions, scoreScale } from "@/lib/scales";
import type { AppLanguage, ScaleId, ScaleResult } from "@/lib/types";

export function ScaleSelector({
  activeIds,
  onPick
}: {
  activeIds: ScaleId[];
  onPick: (id: ScaleId) => void;
}) {
  return (
    <div className="scale-selector">
      <div className="scale-selector-title">临床量表（自评，不替代诊断）</div>
      <div className="scale-selector-grid">
        {SCALES.map((scale) => (
          <button
            key={scale.id}
            type="button"
            className={`scale-pick${activeIds.includes(scale.id) ? " done" : ""}`}
            onClick={() => onPick(scale.id)}
          >
            <span>{scale.id}</span>
            <small>{scale.name.replace(/^.*?\s/, "")}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ScaleModal({
  scaleId,
  language = "zh",
  onClose,
  onSubmit
}: {
  scaleId: ScaleId;
  language?: AppLanguage;
  onClose: () => void;
  onSubmit: (result: ScaleResult) => void;
}) {
  const scale = useMemo(() => {
    const base = getScaleById(scaleId);
    return base ? localizeScale(base, language) : undefined;
  }, [scaleId, language]);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    scale ? new Array(scale.items.length).fill(null) : []
  );
  const [functionalImpairment, setFunctionalImpairment] = useState<ScaleResult["functionalImpairment"] | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!scale) return null;

  const allAnswered =
    answers.every((value) => value !== null) &&
    (!scale.functionalImpairmentPrompt || Boolean(functionalImpairment));

  function handleSubmit() {
    if (!allAnswered) return;
    const result = scoreScale(scaleId, answers as number[], {
      functionalImpairment: functionalImpairment ?? undefined,
      language
    });
    if (result) {
      onSubmit(result);
    }
  }

  return (
    <div className="scale-overlay" role="dialog" aria-modal="true" aria-label={scale.name}>
      <div className="scale-dialog">
        <header className="scale-dialog-header">
          <div>
            <h3>{scale.name}</h3>
            <p>
              {scale.intro} 来源：
              <a href={scale.sourceUrl} target="_blank" rel="noreferrer">
                {scale.sourceName}
              </a>
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="scale-items">
          <div className="scale-scoring-table" aria-label={`${scale.id} ${language === "en" ? "scoring" : "计分规则"}`}>
            <div className="scale-scoring-title">{language === "en" ? "Scoring" : "计分规则"}</div>
            <div className="scale-scoring-grid">
              {scale.scoringBands.map((band) => (
                <div key={`${band.min}-${band.max}`} className="scale-scoring-row">
                  <span>
                    {band.min}-{band.max} {language === "en" ? "pts" : "分"}
                  </span>
                  <strong>{band.label}</strong>
                  <small>{band.guidance}</small>
                </div>
              ))}
            </div>
          </div>

          {scale.items.map((item, index) => (
            <div key={`${scale.id}-${index}`} className="scale-item">
              <div className="scale-item-text">
                <span className="scale-index">{index + 1}.</span>
                <span>{item}</span>
              </div>
              <div className="scale-options">
                {scale.options.map((option) => {
                  const selected = answers[index] === option.value;
                  return (
                    <button
                      key={`${index}-${option.value}`}
                      type="button"
                      className={`scale-option${selected ? " selected" : ""}`}
                      onClick={() =>
                        setAnswers((current) => {
                          const next = [...current];
                          next[index] = option.value;
                          return next;
                        })
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {scale.functionalImpairmentPrompt ? (
            <div className="scale-functional">
              <div className="scale-functional-title">{scale.functionalImpairmentPrompt}</div>
              <div className="scale-functional-grid">
                {localizedFunctionalOptions(language).map((option) => {
                  const selected = functionalImpairment === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`scale-functional-option${selected ? " selected" : ""}`}
                      onClick={() => setFunctionalImpairment(option.value)}
                    >
                      <span>{option.label}</span>
                      <small>{option.description}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="scale-footer">
          <small>
            {language === "en"
              ? "This scale is for self-observation and conversation prep only. It is not a medical diagnosis. Please reach out to a licensed professional if needed."
              : "本量表用于自我观察和沟通准备，不构成医学诊断。必要时请联系持证专业人员。"}
          </small>
          <button
            type="button"
            className="primary-button"
            disabled={!allAnswered}
            onClick={handleSubmit}
          >
            提交并查看分数
          </button>
        </footer>
      </div>
    </div>
  );
}
