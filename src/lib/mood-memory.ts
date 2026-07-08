// 心情记忆 (Mood Memory) — a durable, cross-session record of how the user has
// been feeling. Unlike the per-turn caseMap/mentalState (a current snapshot that
// is cleared with the session), this accumulates a short emotional timeline,
// survives "clear session", is shown to the user, and is summarised back into the
// counselor LLM prompt so it can reference continuity ("上次你提到的那件事…").
//
// Stored separately from the session so a fresh session still "remembers" the user.

export type MoodEntry = {
  id: string;
  at: string; // ISO timestamp
  affect: string; // emotion words, e.g. "焦虑、低落"
  intensity: number | null; // 0-10 from mentalState
  note: string; // one-line context (caseMap.presenting / mainProblem)
  tags: string[]; // triggers, e.g. ["室友", "睡眠"]
};

export type MoodMemory = {
  entries: MoodEntry[];
  updatedAt: string;
};

const STORAGE_KEY = "quiet-room-mood-memory-v1";
const MAX_ENTRIES = 24;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emptyMemory(): MoodMemory {
  return { entries: [], updatedAt: "" };
}

function sanitizeEntry(value: unknown): MoodEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Partial<MoodEntry>;
  if (typeof e.id !== "string" || typeof e.at !== "string" || typeof e.affect !== "string" || typeof e.note !== "string") {
    return null;
  }
  return {
    id: e.id,
    at: e.at,
    affect: e.affect,
    intensity: typeof e.intensity === "number" ? e.intensity : null,
    note: e.note,
    tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === "string").slice(0, 6) : []
  };
}

export function readMoodMemory(): MoodMemory {
  const storage = getStorage();
  if (!storage) return emptyMemory();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw) as Partial<MoodMemory>;
    if (!Array.isArray(parsed.entries)) return emptyMemory();
    const entries = parsed.entries.map(sanitizeEntry).filter((e): e is MoodEntry => e !== null).slice(-MAX_ENTRIES);
    return { entries, updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "" };
  } catch {
    return emptyMemory();
  }
}

function writeMoodMemory(memory: MoodMemory) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Mood memory is a convenience layer; never block the chat on a storage error.
  }
}

/**
 * Record one mood snapshot. Skips empty/non-informative captures, and dedupes a
 * capture that is identical to the most recent one (so repeated turns about the
 * same thing don't spam the timeline). Returns the new memory for state lifting.
 */
export function recordMood(input: {
  affect: string;
  intensity: number | null;
  note: string;
  tags?: string[];
  now?: string;
}): MoodMemory {
  const current = readMoodMemory();
  const affect = input.affect.trim();
  const note = input.note.trim();
  if ((!affect || affect === "不明确" || affect === "不清楚") && !note) return current;

  const last = current.entries.at(-1);
  if (last && last.affect === affect && last.note === note) return current;

  const entry: MoodEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: input.now ?? new Date().toISOString(),
    affect: affect || "说不清",
    intensity: typeof input.intensity === "number" ? input.intensity : null,
    note,
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 6)
  };
  const next: MoodMemory = {
    entries: [...current.entries, entry].slice(-MAX_ENTRIES),
    updatedAt: entry.at
  };
  writeMoodMemory(next);
  return next;
}

export function clearMoodMemory(): MoodMemory {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return emptyMemory();
}

/**
 * Compact summary fed to the counselor LLM so it can reference the user's recent
 * emotional history. Returns "" when there's nothing to remember.
 */
export function summarizeMoodMemory(memory: MoodMemory, limit = 6): string {
  if (memory.entries.length === 0) return "";
  return memory.entries
    .slice(-limit)
    .map((entry) => {
      const date = entry.at.length >= 10 ? entry.at.slice(5, 10).replace("-", "/") : "";
      const intensity = typeof entry.intensity === "number" ? `（强度 ${entry.intensity}/10）` : "";
      const tags = entry.tags.length ? `｜${entry.tags.join("、")}` : "";
      return `- ${date} ${entry.affect}${intensity}：${entry.note}${tags}`.trim();
    })
    .join("\n");
}
