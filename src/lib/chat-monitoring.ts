// Best-effort observations for this server instance. No request, message, key,
// provider error text or user identifier is retained.
export type ChatLlmHealth = {
  healthy: boolean | null;
  status: "unknown" | "healthy" | "degraded";
  consecutiveFailures: number;
  recentFailures: number;
  observations: number;
  scope: "instance";
};

const WINDOW_MS = 5 * 60_000;
const MAX_OBSERVATIONS = 500;
let observations: Array<{ at: number; failed: boolean }> = [];

function recentObservations() {
  const cutoff = Date.now() - WINDOW_MS;
  observations = observations.filter((entry) => entry.at > cutoff);
  return observations;
}

export function getChatLlmHealth(): ChatLlmHealth {
  const recent = recentObservations();
  let consecutiveFailures = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i].failed; i--) consecutiveFailures++;
  const status = recent.length === 0 ? "unknown" : consecutiveFailures > 0 ? "degraded" : "healthy";
  return {
    healthy: status === "unknown" ? null : status === "healthy",
    status,
    consecutiveFailures,
    recentFailures: recent.filter((entry) => entry.failed).length,
    observations: recent.length,
    scope: "instance"
  };
}

export function recordChatLlmFallback(failed: boolean): void {
  recentObservations();
  observations.push({ at: Date.now(), failed });
  if (observations.length > MAX_OBSERVATIONS) observations.splice(0, observations.length - MAX_OBSERVATIONS);
}
