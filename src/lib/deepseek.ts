import type { ChatMessage } from "./types";
import {
  getPipelineMode,
  isValidApiModel,
  resolveApiModel,
  resolveDeepSeekModel,
  type DeepSeekModelId,
  type SessionPaceId
} from "./model-options";

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekPayload = {
  model: string;
  messages: DeepSeekMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
  // Only sent for the standard chat model. deepseek-reasoner reasons inherently
  // and rejects/ignores a thinking-disable, so we omit it there.
  thinking?: {
    type: "disabled";
  };
};

const DEFAULT_BASE_URL = "https://api.deepseek.com";

export function getDeepSeekConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
    model: resolveApiModel()
  };
}

/**
 * DeepSeek (like other OpenAI-compatible chat APIs) expects the messages after
 * the system prompt to read as a real dialogue: begin with a user turn and
 * strictly alternate user/assistant. Our UI history violates this in two ways
 * that only surface once a conversation grows long — which is exactly when
 * users report the assistant "已读乱回" (replies incoherently):
 *
 *   1. The history opens with an assistant greeting ("welcome-message"), and
 *      once the route's slice(-16) window activates (conversation > 16 msgs)
 *      the window itself can begin on an assistant turn.
 *   2. Switching persona injects an unpaired assistant transition message,
 *      producing two assistant turns back-to-back.
 *
 * A leading-assistant or consecutive same-role sequence makes the provider lose
 * track of whose turn it is (some OpenAI-compatible backends 400, others just
 * degrade). This normalizes the array so it always starts with a user turn and
 * alternates: drop leading assistant turns, then merge consecutive same-role
 * turns into one. The newest message is always the user's, so the result also
 * ends on a user turn — ready for a completion.
 */
export function normalizeConversationForProvider(messages: ChatMessage[]) {
  // 1. Drop leading assistant turns — the model should be answering a user.
  let start = 0;
  while (start < messages.length && messages[start].role === "assistant") {
    start += 1;
  }

  // 2. Merge consecutive same-role turns so roles strictly alternate.
  const normalized: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = start; i < messages.length; i += 1) {
    const turn = messages[i];
    const last = normalized[normalized.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n${turn.content}`;
    } else {
      normalized.push({ role: turn.role, content: turn.content });
    }
  }

  return normalized;
}

export function buildDeepSeekPayload(input: {
  systemPrompt: string;
  messages: ChatMessage[];
  model?: DeepSeekModelId;        // legacy UI-label, ignored (kept for callers)
  apiModel?: string;              // real API model: deepseek-chat | deepseek-reasoner
  stream?: boolean;
  maxTokens?: number;
}) {
  // The real API model: an explicit, VALID apiModel (the deep/fast → reasoner/chat
  // choice) overrides the env default. Unknown values fall back to env so a bad
  // value never 400s the provider. The stale UI-label ids ("deepseek-v4-pro" …)
  // are NOT valid API names and would 400 — never send them.
  const model = isValidApiModel(input.apiModel) ? input.apiModel : getDeepSeekConfig().model;
  const isReasoner = model === "deepseek-reasoner";

  return {
    model,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...normalizeConversationForProvider(input.messages)
    ],
    temperature: 0.5,
    // reasoner spends tokens on the hidden chain-of-thought too, so give it room.
    max_tokens: input.maxTokens ?? (isReasoner ? 1600 : 900),
    stream: input.stream ?? true,
    // reasoner reasons inherently — omit the thinking-disable it would reject.
    ...(isReasoner ? {} : { thinking: { type: "disabled" as const } })
  } satisfies DeepSeekPayload;
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

function withPromiseTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("DeepSeek response timed out"));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function requestDeepSeek(payload: DeepSeekPayload) {
  const config = getDeepSeekConfig();

  if (!config.apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  // deepseek-reasoner thinks before any token and can take 15-40s; 30s would
  // often abort it (→ fallback, reads as broken). Keep it under route maxDuration (60s).
  const timeoutMs = payload.model === "deepseek-reasoner" ? 55_000 : 30_000;
  const { controller, clear } = withTimeout(timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`DeepSeek API error ${response.status}: ${text.slice(0, 240)}`);
    }

    return response;
  } finally {
    clear();
  }
}

export async function createDeepSeekTextStream(payload: DeepSeekPayload) {
  const response = await requestDeepSeek({ ...payload, stream: true });

  if (!response.body) {
    throw new Error("DeepSeek response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const pendingTexts: string[] = [];
  let isDone = false;

  function drainLines(lines: string[]) {
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.replace(/^data:\s*/, "");
      if (data === "[DONE]") {
        isDone = true;
        return;
      }

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;

        if (content) {
          pendingTexts.push(content);
        }
      } catch {
        // Ignore malformed provider chunks and continue reading.
      }
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const pending = pendingTexts.shift();
        if (pending) {
          controller.enqueue(encoder.encode(pending));
          return;
        }

        if (isDone) {
          controller.close();
          return;
        }

        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        drainLines(lines);
      }
    },
    cancel() {
      void reader.cancel();
    }
  });
}

export async function generateDeepSeekText(payload: DeepSeekPayload) {
  const response = await requestDeepSeek({ ...payload, stream: false });
  const json = (await withPromiseTimeout(response.json(), 30_000, () => {
    void response.body?.cancel();
  })) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content?.trim() ?? "";
}
