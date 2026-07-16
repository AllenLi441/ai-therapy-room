import type { ChatMessage } from "./types";
import { resilientFetch } from "./net";

type KimiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type KimiPayload = {
  model: string;
  messages: KimiMessage[];
  temperature: number;
  max_tokens: number;
  response_format?: { type: "json_object" };
};

const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "moonshot-v1-32k";

export function getKimiConfig() {
  return {
    apiKey: process.env.KIMI_API_KEY,
    baseUrl: process.env.KIMI_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.KIMI_MODEL || DEFAULT_MODEL
  };
}

export function isKimiConfigured() {
  return Boolean(process.env.KIMI_API_KEY);
}

export function buildKimiPayload(input: {
  systemPrompt: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): KimiPayload {
  const config = getKimiConfig();

  return {
    model: config.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...input.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ],
    temperature: input.temperature ?? 0.3,
    max_tokens: input.maxTokens ?? 1200,
    ...(input.jsonMode ? { response_format: { type: "json_object" as const } } : {})
  };
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
      reject(new Error("Kimi response timed out"));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function generateKimiText(payload: KimiPayload, timeoutMs = 25_000) {
  const config = getKimiConfig();

  if (!config.apiKey) {
    throw new Error("Missing KIMI_API_KEY");
  }

  const { controller, clear } = withTimeout(timeoutMs);

  try {
    const response = await resilientFetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
      throw new Error(`Kimi API error ${response.status}: ${text.slice(0, 240)}`);
    }

    const json = (await withPromiseTimeout(response.json(), timeoutMs, () => {
      void response.body?.cancel();
    })) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return json.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clear();
  }
}

const DEFAULT_VISION_MODEL = "moonshot-v1-8k-vision-preview";

export function getKimiVisionModel() {
  return process.env.KIMI_VISION_MODEL || DEFAULT_VISION_MODEL;
}

/**
 * Multimodal (2026-06-13): describe an uploaded image via Kimi (Moonshot)
 * vision so the image's content can enter the text conversation that DeepSeek
 * drives. Returns a plain-language, non-judgmental Chinese description. The
 * caller feeds this back into /api/chat as context, where the normal
 * risk-detection layer then runs over it (so a distressing image is still
 * screened). Kimi vision takes IMAGES; video is not supported here — extract
 * frames upstream if that's ever needed.
 */
export async function describeImageWithKimi(
  input: { imageDataUrl: string; prompt?: string },
  timeoutMs = 30_000
): Promise<string> {
  const config = getKimiConfig();
  if (!config.apiKey) {
    throw new Error("Missing KIMI_API_KEY");
  }

  const { controller, clear } = withTimeout(timeoutMs);

  try {
    const response = await resilientFetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: getKimiVisionModel(),
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: input.imageDataUrl } },
              {
                type: "text",
                text:
                  input.prompt ??
                  "请用中文简要、客观地描述这张图片里的主要内容；如果它透露了某种情绪、处境或求助信号，也点出来。不要诊断、不要评判、不要给医疗建议。"
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 700
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Kimi vision error ${response.status}: ${text.slice(0, 240)}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return json.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clear();
  }
}
