// The chat talks to a real DeepSeek model chosen by SESSION PACE:
//   deep → deepseek-v4-pro   + full plan/review pipeline (more considered, slower)
//   fast → deepseek-v4-flash + skip the review pass (quicker)
// The env var DEEPSEEK_MODEL still sets the model for non-pace callers (e.g. the
// summary route) and as a fallback; it defaults to the fast tier.
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

// The real DeepSeek API model name (env-driven; used by the summary route and as
// the chat fallback). Defaults to the cheap fast tier.
export const DEFAULT_DEEPSEEK_API_MODEL = "deepseek-v4-flash";

// Current DeepSeek API models: "deepseek-v4-flash" (fast) and "deepseek-v4-pro"
// (the 1.6T reasoning tier). Legacy aliases "deepseek-chat"/"deepseek-reasoner"
// are deprecated 2026-07-24 (both map to v4-flash's non-thinking/thinking modes),
// so we standardize on the v4 names and coerce anything unknown to the fast
// default rather than 400 the provider.
const VALID_API_MODELS = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);

export function resolveApiModel(): string {
  const fromEnv = process.env.DEEPSEEK_MODEL?.trim();
  return fromEnv && VALID_API_MODELS.has(fromEnv) ? fromEnv : DEFAULT_DEEPSEEK_API_MODEL;
}

export function isValidApiModel(value: unknown): value is string {
  return typeof value === "string" && VALID_API_MODELS.has(value);
}

// The deep/fast toggle selects a REAL model: deep = deepseek-v4-pro (the 1.6T
// reasoning model, deeper + slower + pricier), fast = deepseek-v4-flash (quicker,
// cheaper). Both are current DeepSeek API model names.
export function resolveApiModelForPace(pace: unknown): string {
  return resolveSessionPace(pace) === "fast" ? "deepseek-v4-flash" : "deepseek-v4-pro";
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
