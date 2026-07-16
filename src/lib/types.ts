export type ChatRole = "user" | "assistant";

export type AppLanguage = "zh" | "en";

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  createdAt?: string;
};

export type ConsultGoal = "listen" | "mechanism" | "exercise" | "expression";

export const CONSULT_GOALS: { id: ConsultGoal; label: string; description: string }[] = [
  { id: "listen", label: "先被听见", description: "这一轮先不给方法，只倾听和反映" },
  { id: "mechanism", label: "找心理循环", description: "帮我看清困扰背后的想法-情绪-行为循环" },
  { id: "exercise", label: "做一个练习", description: "给我一个具体、低负担的小练习" },
  { id: "expression", label: "关系表达", description: "帮我整理想对某人说的话" }
];

export type IntakeProfile = {
  nickname?: string;
  concern?: string;
  intensity?: number;
};

export type RiskLevel = "none" | "low" | "medium" | "high";

export type DangerLevel = 1 | 2 | 3;

export type RiskCategory =
  | "self_harm"
  | "suicide"
  | "harm_to_others"
  | "abuse"
  | "psychosis"
  | "panic"
  | "medical";

export type RiskFlag =
  | "medical_red_flag"
  | "crisis_session_active"
  | "medication_request"
  | "diagnosis_request"
  | "concern_for_other"
  | "safety_confirmation"
  | "suicide_concern";

/**
 * Research-aligned three-layer risk schema.
 *
 * Reference: short-term roadmap item #1 in the implicit-suicidal-ideation
 * research synthesis ("Replace binary labels with a fine-grained schema:
 * passive death wish, self-harm, explicit ideation, self/other/hyperbole,
 * hopelessness, entrapment, evidence spans").
 *
 * Mapped roughly to:
 *  - C-SSRS / NIMH-ASQ severity ladder (RiskSeverity)
 *  - Pragmatic form layer from the Qadir et al. private-DM study
 *  - Modifier layer combining cognitive (hopelessness, entrapment),
 *    interpersonal (burdensomeness, isolation), and capability
 *    (means, timeframe, farewell) dimensions.
 */
export type RiskSeverity =
  | "none"
  | "passive_death_wish"
  | "suicidal_ideation"
  | "plan_preparation"
  | "imminent_acute"
  | "post_attempt_disclosure"
  | "non_suicidal_self_harm";

export type PragmaticForm =
  | "self"
  | "other"
  | "quote_fictional"
  | "sarcasm_hyperbole"
  | "rhetorical_complaint"
  | "emoji_coded"
  | "coded_euphemism"
  | "uncertain_ambivalent";

export type RiskModifier =
  | "hopelessness"
  | "burdensomeness"
  | "entrapment"
  | "isolation"
  | "farewell_closure"
  | "means_capability"
  | "timeframe_recency"
  | "help_seeking"
  | "protective_factor"
  | "cognitive_distortion";

export type ImplicitRiskAssessment = {
  severity: RiskSeverity;
  pragmatic: PragmaticForm;
  modifiers: RiskModifier[];
  /** Direct quotes from the user that support the assessment. Max 3. */
  evidence: string[];
  /** 0–1, model's confidence in the severity/pragmatic call. */
  confidence: number;
  /** Flags the LLM recommends adding to the lexicon-derived RiskAssessment. */
  suggestedFlags: RiskFlag[];
  /** Brief explanation, < 120 chars. */
  rationale: string;
  /** Which classifier actually produced this result — Kimi (primary) or the
   *  DeepSeek backup judge invoked when Kimi failed. Optional so existing
   *  callers/tests that build an ImplicitRiskAssessment literal stay valid. */
  judgedBy?: "kimi" | "deepseek";
  /** Why the DeepSeek backup judge answered instead of Kimi. Set only when
   *  judgedBy="deepseek"; categories from classifyKimiJudgeError (implicit-risk.ts). */
  fallbackReason?:
    | "kimi_billing"
    | "kimi_rate"
    | "kimi_transient"
    | "kimi_timeout"
    | "kimi_parse"
    | "kimi_circuit_open";
};

export type RiskAssessment = {
  level: RiskLevel;
  categories: RiskCategory[];
  matchedTerms: string[];
  flags: RiskFlag[];
  shouldEscalate: boolean;
  rationale: string;
  /** Optional implicit/semantic layer from the LLM-based classifier. */
  implicit?: ImplicitRiskAssessment;
};

export type CrisisSession = {
  active: boolean;
  startedAt: string;
  lastUpdatedAt: string;
  reason: string;
};

export type KnowledgeCard = {
  id: string;
  title: string;
  tags: string[];
  keywords: string[];
  content: string;
  guidance: string[];
  // VERIFIABLE source (2026-06 rebuild): a specific, long-standing authoritative
  // research source — not a domain label. sourceUrl is clickable so anyone can check
  // the claim; sourceQuote is a VERBATIM excerpt actually fetched from that page
  // (omitted when the figure came from a search index rather than a direct fetch).
  // Shown to the user as "数据来源" under the reply (see the chat UI).
  sourceTitle?: string;
  sourceUrl?: string;
  sourceQuote?: string;
  // Professional sign-off gate: only "approved" cards are retrieved (see knowledge.ts).
  // Missing / "draft" / "pending" = NOT approved = inert. "pending" is the review
  // queue for research-tier chunks ingested by the M2 pipeline (design §4.1).
  clinicalStatus?: "draft" | "approved" | "pending";
  // Optional RAG-corpus metadata (P5 clinical RAG). All optional so the hand-written
  // 17 cards and every existing test stay valid. Populated by the ingest pipeline and
  // carried in the Qdrant payload; used for language/trust filtering and source tracing.
  lang?: "zh" | "en";
  trustTier?: "authoritative" | "research";
  // Owning source (for re-crawl / take-down of a whole source) and the heading path
  // of the chunk within that source (for provenance).
  sourceId?: string;
  chunkPath?: string;
};

export type TherapyModality =
  | "person-centered"
  | "CBT"
  | "ACT"
  | "DBT"
  | "MI"
  | "trauma-informed"
  | "crisis";

export type CaseMap = {
  presenting: string;
  triggers: string[];
  automaticThoughts: string[];
  coreBeliefs: string[];
  bodyResponses: string[];
  behaviors: string[];
  needsValues: string[];
  resources: string[];
  workingHypothesis: string;
  updatedAt: string;
};

export type TurnPlan = {
  modality: TherapyModality;
  protocolStep: string;
  whatToReflect: string;
  intervention: string;
  clarifyingQuestion: string;
  avoid: string;
  // Per-turn emotion read from the supervisor: the user's current PRIMARY
  // emotion + intensity + unmet need. Optional so existing plan factories stay valid.
  emotionRead?: string;
};

// Supervisor's read of the user's current mental state (a per-turn snapshot).
// Passed through to the reviewer; optional/nullable everywhere.
export type MentalState = {
  primaryEmotion: string;
  intensity: number; // 0-10
  unmetNeed?: string;
  evidence?: string;
};

export type ScaleId = "PHQ-9" | "GAD-7" | "ISI" | "PCL-5";

export type ScaleResult = {
  id: ScaleId;
  total: number;
  severity: string;
  answers: number[];
  functionalImpairment?: string;
  completedAt: string;
};

export type SessionPlan = {
  caseMap: CaseMap;
  turnPlan: TurnPlan;
};

export function emptyCaseMap(): CaseMap {
  return {
    presenting: "",
    triggers: [],
    automaticThoughts: [],
    coreBeliefs: [],
    bodyResponses: [],
    behaviors: [],
    needsValues: [],
    resources: [],
    workingHypothesis: "",
    updatedAt: ""
  };
}

export function isCaseMapPopulated(map: CaseMap | undefined | null) {
  if (!map) return false;
  return Boolean(
    map.presenting ||
      map.workingHypothesis ||
      map.triggers.length ||
      map.automaticThoughts.length ||
      map.coreBeliefs.length ||
      map.bodyResponses.length ||
      map.behaviors.length ||
      map.needsValues.length ||
      map.resources.length
  );
}
