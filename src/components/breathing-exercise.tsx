"use client";

import { Wind } from "lucide-react";
import { useEffect, useState } from "react";

type Phase = "in" | "hold" | "out";

const CYCLE_PHASES: { id: Phase; label: string; duration: number }[] = [
  { id: "in", label: "吸气", duration: 4 },
  { id: "hold", label: "屏住", duration: 7 },
  { id: "out", label: "呼气", duration: 8 }
];

const CYCLE_LENGTH = CYCLE_PHASES.reduce((sum, p) => sum + p.duration, 0); // 19s
const TOTAL_CYCLES = 3;
const TOTAL_DURATION = CYCLE_LENGTH * TOTAL_CYCLES; // 57s

function phaseAtSecond(second: number) {
  let elapsed = second % CYCLE_LENGTH;
  for (const phase of CYCLE_PHASES) {
    if (elapsed < phase.duration) return phase;
    elapsed -= phase.duration;
  }
  return CYCLE_PHASES[0];
}

export function BreathingExercise() {
  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      setElapsed((t) => {
        if (t + 1 >= TOTAL_DURATION) {
          setActive(false);
          return 0;
        }
        return t + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [active]);

  function start() {
    setElapsed(0);
    setActive(true);
  }

  function stop() {
    setActive(false);
    setElapsed(0);
  }

  const phase = active ? phaseAtSecond(elapsed) : CYCLE_PHASES[0];
  const cycleIndex = active ? Math.floor(elapsed / CYCLE_LENGTH) + 1 : 0;
  const secondsLeft = TOTAL_DURATION - elapsed;

  return (
    <div className={`breath-widget${active ? " active" : ""}`} aria-live="polite">
      {active ? (
        <>
          <div
            className={`breath-circle breath-${phase.id}`}
            style={
              {
                "--phase-duration": `${phase.duration}s`
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
          <div className="breath-phase">{phase.label}</div>
          <div className="breath-meta">
            第 {cycleIndex} 轮 · 还剩 {secondsLeft} 秒
          </div>
          <button type="button" className="text-button breath-stop" onClick={stop}>
            停下来
          </button>
        </>
      ) : (
        <button type="button" className="breath-trigger" onClick={start}>
          <Wind size={14} />
          和我一起呼吸 1 分钟
        </button>
      )}
    </div>
  );
}
