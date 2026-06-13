// The chat always talks to ONE real DeepSeek model (deepseek-chat by default;
// override with the DEEPSEEK_MODEL env var). The picker in the UI does NOT choose
// a model — it chooses the SESSION PACE, i.e. how much of our own pipeline runs:
//   deep → full plan + review pipeline (more considered, a little slower)
//   fast → skip the review pass for a quicker reply
// Both paces use the same underlying model.
export const SESSION_PACE_OPTIONS = [
  {
    id: "deep",
    label: "深度模式",
    description: "带复核的完整流程，适合复杂倾诉、关系议题和长对话（默认）。"
  },
  {
    id: "fast",
    label: "快速模式",
    description: "跳过复核、回应更快，适合轻量陪伴和日常梳理。"
  }
] as const;

export type SessionPaceId = (typeof SESSION_PACE_OPTIONS)[number]["id"];

export const DEFAULT_SESSION_PACE: SessionPaceId = "deep";

export type ModelPipelineMode = "fast" | "deep";

export function isSessionPaceId(value: unknown): value is SessionPaceId {
  return value === "deep" || value === "fast";
}

export function resolveSessionPace(value: unknown): SessionPaceId {
  return isSessionPaceId(value) ? value : DEFAULT_SESSION_PACE;
}

export function getPipelineMode(pace: unknown): ModelPipelineMode {
  return resolveSessionPace(pace) === "fast" ? "fast" : "deep";
}

// The real DeepSeek API model name. Driven entirely by env; never coerced to a UI
// label, so DEEPSEEK_MODEL=deepseek-chat (or deepseek-reasoner) reaches the API as-is.
export const DEFAULT_DEEPSEEK_API_MODEL = "deepseek-chat";

export function resolveApiModel(): string {
  const fromEnv = process.env.DEEPSEEK_MODEL?.trim();
  return fromEnv ? fromEnv : DEFAULT_DEEPSEEK_API_MODEL;
}

// ── RECOVERY RECONCILIATION (2026-06-13) ──────────────────────────────────────
// Older callers (src/app/api/chat, src/app/api/summary, src/lib/deepseek.ts)
// still import the model-picker API that predates the session-pace refactor
// above. These exports were recovered from an earlier model-options.ts snapshot
// and re-added so the recovered app compiles. Both APIs coexist; the chat
// ultimately talks to one DeepSeek model via resolveApiModel(). ⚠️ Decide
// whether the UI should expose model choice or session pace, then drop the
// unused side.
export const DEEPSEEK_MODEL_OPTIONS = [
  {
    id: "deepseek-v5.5-pro",
    label: "Pro 5.5",
    description: "深度优先，适合复杂倾诉、关系议题和长对话（当前版本默认模型）。"
  },
  {
    id: "deepseek-v5.5-flash",
    label: "快速 5.5",
    description: "速度优先，适合轻量陪伴和日常梳理。"
  },
  {
    id: "deepseek-v4-pro",
    label: "Pro 4.0",
    description: "兼容回退：质量优先，适合复杂倾诉、关系议题和长对话。"
  },
  {
    id: "deepseek-v4-flash",
    label: "快速 4.0",
    description: "兼容回退：速度优先，适合轻量陪伴和日常梳理。"
  }
] as const;

export type DeepSeekModelId = (typeof DEEPSEEK_MODEL_OPTIONS)[number]["id"];

export const DEFAULT_DEEPSEEK_MODEL: DeepSeekModelId = "deepseek-v5.5-pro";

export function isDeepSeekModelId(value: unknown): value is DeepSeekModelId {
  return typeof value === "string" && DEEPSEEK_MODEL_OPTIONS.some((option) => option.id === value);
}

export function isFastModelId(value: DeepSeekModelId): boolean {
  return value.endsWith("-flash");
}

export function resolveDeepSeekModel(value: unknown): DeepSeekModelId {
  return isDeepSeekModelId(value) ? value : DEFAULT_DEEPSEEK_MODEL;
}

export function getPipelineModeForModel(value: unknown): ModelPipelineMode {
  return isFastModelId(resolveDeepSeekModel(value)) ? "fast" : "deep";
}
