// crisis-resources.ts — SINGLE SOURCE OF TRUTH for crisis hotlines / resources.
//
// Why this exists: the same numbers were hardcoded in BOTH the server-side safety
// templates (safety.ts) and the UI CrisisSheet (overlays.tsx), with no shared
// constant — a drift risk for a mental-health product. Both sides should read the
// numbers from here so they can never disagree.
//
// ⚠️ HUMAN-REVIEW ITEM: these are the values currently LIVE in production. Whether
// this is the correct/canonical set (numbers, which lines, regions) is for a mental-
// health professional to confirm — see `_SAFETY_v2_DRAFTS_待评审.md`. Do NOT change a
// number here without that sign-off. This module is pure data (no behavior change);
// wiring consumers is a behavior-preserving refactor.

export type CrisisHotline = {
  id: "psych" | "police" | "medical";
  number: string; // displayed / dialable
  tel: string;    // tel: href target
  zh: string;     // label (zh)
  en: string;     // label (en)
};

// The three lines surfaced in the UI CrisisSheet.
export const CN_PRIMARY_HOTLINES: CrisisHotline[] = [
  { id: "psych", number: "12356", tel: "12356", zh: "全国心理援助热线", en: "Psychological support line" },
  { id: "police", number: "110", tel: "110", zh: "公安报警", en: "Police" },
  { id: "medical", number: "120", tel: "120", zh: "急救", en: "Emergency medical" }
];

// Supplemental CN lines referenced inside the safety.ts crisis templates.
export const CN_SUPPLEMENTAL = {
  beijing: "010-82951332", // 北京心理援助热线
  hope24: "400-161-9995",  // 希望24热线
  youth: "12355"           // 全国青少年服务台（未成年）
} as const;

// International fallbacks referenced inside the EN safety templates.
export const INTL_RESOURCES = {
  usCrisis: "988",
  usEmergency: "911",
  ukSamaritans: "116 123",
  auLifeline: "13 11 14",
  finder: "findahelpline.com"
} as const;
