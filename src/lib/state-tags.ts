import type { ScaleId, ScaleResult } from "./types";

/**
 * Internal-only state tags derived from completed self-report scales.
 *
 * Design constraints (decided with the product owner, 2026-06-08):
 *   - These tags are NEVER shown to the user. A user-facing label like
 *     "情绪严重低落" reads as a diagnosis; PHQ-9/GAD-7/ISI are screening
 *     instruments, not diagnostic ones, and prompts.ts forbids diagnostic
 *     labels in user-facing output.
 *   - The tag exists so the *system* can act on a completed scale: raise the
 *     counselor's safety attention, shape tone/depth, and (later) drive
 *     re-test trends and persona steering.
 *   - The single source of truth is the ScaleResult array already persisted in
 *     the session. Tags are derived on the fly — no duplicated state to sync.
 *
 * Why this exists at all: before this module, completing a scale produced only
 * a total + a severity string that was pasted into the counselor prompt. The
 * per-item answers — including PHQ-9 item 9 ("有不如死掉或用某种方式伤害自己
 * 的念头") — were stored but read by nothing. That self-harm datum was inert.
 */

export type StateTagBand = "ok" | "mild" | "moderate" | "modsevere" | "severe";

export type StateTagFlag = "self_harm_thought" | "severe_distress";

export type StateTag = {
  scaleId: ScaleId;
  /** Stable machine key, e.g. "mood_low_moderate". Internal only. */
  key: string;
  /** Internal Chinese label for prompt/logging, e.g. "情绪低落（中等）". Never shown to the user. */
  label: string;
  band: StateTagBand;
  score: number;
  flags: StateTagFlag[];
  /** ISO timestamp copied from the source ScaleResult. */
  at: string;
};

export type ScaleSafetySignal = {
  /** True when the latest PHQ-9 endorsed item 9 at any frequency (>= 1). */
  selfHarmThought: boolean;
  /** Latest PHQ-9 item-9 frequency 0-3, or null when unavailable. */
  selfHarmFrequency: number | null;
  /** True when any scale's latest result sits in its severe band. */
  severeDistress: boolean;
  /** Short internal notes for the prompt / decision log. */
  notes: string[];
};

/** PHQ-9 item 9 ("有不如死掉或用某种方式伤害自己的念头"), 0-based answer index. */
export const PHQ9_SELF_HARM_ITEM_INDEX = 8;

const PHQ9_ITEM9_FREQUENCY_LABEL = ["完全不会", "好几天", "一半以上的日子", "几乎每天"];

type BandSpec = { max: number; band: StateTagBand; label: string };

// Band cutoffs mirror the scoring() thresholds in scales.ts so the tag and the
// scale's own severity string never disagree. `domain` prefixes the machine key.
const SCALE_BANDS: Partial<Record<ScaleId, { domain: string; bands: BandSpec[] }>> = {
  "PHQ-9": {
    domain: "mood_low",
    bands: [
      { max: 4, band: "ok", label: "情绪平稳" },
      { max: 9, band: "mild", label: "情绪有些低落" },
      { max: 14, band: "moderate", label: "情绪低落（中等）" },
      { max: 19, band: "modsevere", label: "情绪明显低落" },
      { max: Infinity, band: "severe", label: "情绪严重低落" }
    ]
  },
  "GAD-7": {
    domain: "anxiety",
    bands: [
      { max: 4, band: "ok", label: "焦虑不明显" },
      { max: 9, band: "mild", label: "焦虑偏轻" },
      { max: 14, band: "moderate", label: "焦虑（中等）" },
      { max: Infinity, band: "severe", label: "焦虑明显" }
    ]
  },
  ISI: {
    domain: "sleep",
    bands: [
      { max: 7, band: "ok", label: "睡眠基本正常" },
      { max: 14, band: "mild", label: "睡眠轻度困扰" },
      { max: 21, band: "moderate", label: "睡眠困扰（中等）" },
      { max: Infinity, band: "severe", label: "睡眠严重困扰" }
    ]
  }
  // PCL-5 is declared in ScaleId but has no implementation in scales.ts; it
  // intentionally has no band spec and derives to null.
};

/**
 * Keep only the most recent result per scale id. Input order is treated as
 * chronological; ties and empty completedAt fall back to "last one wins".
 */
export function latestResultsPerScale(results?: ScaleResult[]): ScaleResult[] {
  if (!results || results.length === 0) return [];
  const latest = new Map<ScaleId, ScaleResult>();
  for (const result of results) {
    const prev = latest.get(result.id);
    if (!prev || (result.completedAt ?? "") >= (prev.completedAt ?? "")) {
      latest.set(result.id, result);
    }
  }
  return [...latest.values()];
}

export function deriveStateTag(result: ScaleResult): StateTag | null {
  const spec = SCALE_BANDS[result.id];
  if (!spec) return null;

  const bandSpec =
    spec.bands.find((b) => result.total <= b.max) ?? spec.bands[spec.bands.length - 1];

  const flags: StateTagFlag[] = [];
  if (bandSpec.band === "severe") flags.push("severe_distress");

  // Any PHQ-9 item-9 endorsement is the single most safety-relevant datum a
  // scale can carry. Guard the index: tests and older sessions may store an
  // empty/short answers array.
  if (result.id === "PHQ-9") {
    const item9 = result.answers?.[PHQ9_SELF_HARM_ITEM_INDEX];
    if (typeof item9 === "number" && item9 >= 1) flags.push("self_harm_thought");
  }

  return {
    scaleId: result.id,
    key: `${spec.domain}_${bandSpec.band}`,
    label: bandSpec.label,
    band: bandSpec.band,
    score: result.total,
    flags,
    at: result.completedAt
  };
}

export function deriveStateTags(results?: ScaleResult[]): StateTag[] {
  return latestResultsPerScale(results)
    .map(deriveStateTag)
    .filter((tag): tag is StateTag => tag !== null);
}

export function scaleSafetySignal(results?: ScaleResult[]): ScaleSafetySignal {
  const notes: string[] = [];
  const empty: ScaleSafetySignal = {
    selfHarmThought: false,
    selfHarmFrequency: null,
    severeDistress: false,
    notes
  };
  if (!results || results.length === 0) return empty;

  const latest = latestResultsPerScale(results);
  const tags = latest.map(deriveStateTag).filter((tag): tag is StateTag => tag !== null);

  const severeTags = tags.filter((tag) => tag.flags.includes("severe_distress"));
  const severeDistress = severeTags.length > 0;

  const phq9 = latest.find((result) => result.id === "PHQ-9");
  let selfHarmThought = false;
  let selfHarmFrequency: number | null = null;
  if (phq9) {
    const item9 = phq9.answers?.[PHQ9_SELF_HARM_ITEM_INDEX];
    if (typeof item9 === "number") {
      selfHarmFrequency = item9;
      if (item9 >= 1) {
        selfHarmThought = true;
        notes.push(`PHQ-9 自伤条目被勾选：${PHQ9_ITEM9_FREQUENCY_LABEL[item9] ?? `频率 ${item9}`}`);
      }
    }
  }
  if (severeDistress) {
    notes.push(`量表重度区间：${severeTags.map((tag) => tag.label).join("、")}`);
  }

  return { selfHarmThought, selfHarmFrequency, severeDistress, notes };
}
