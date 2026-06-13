"use client";

import { getPersonaForModality } from "@/lib/personas";
import type { TherapyModality } from "@/lib/types";

export function PersonaCard({ modality }: { modality: TherapyModality | null | undefined }) {
  // Before the first turn there is no plan yet — show a soft "waiting" state
  // rather than guessing a counselor.
  if (!modality) {
    return (
      <section className="persona-card persona-card-empty" aria-label="正在陪你的咨询师">
        <div className="persona-card-label">今天陪你的</div>
        <p className="persona-card-empty-body">
          我会根据你打开的这扇门，选一个最合适的咨询师来陪你。说一两句，我就知道该请谁了。
        </p>
      </section>
    );
  }

  const persona = getPersonaForModality(modality);

  return (
    <section className="persona-card" aria-label="正在陪你的咨询师">
      <div className="persona-card-label">今天陪你的</div>
      <div className="persona-card-name">{persona.name}</div>
      <div className="persona-card-title">{persona.title}</div>
      <div className="persona-card-flavor">{persona.flavor}</div>
      <p className="persona-card-intro">{persona.intro}</p>
    </section>
  );
}
