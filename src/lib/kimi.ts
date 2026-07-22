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

export type KimiProvider = "siliconflow" | "moonshot";

const DEFAULT_SILICONFLOW_BASE_URL = "https://api.siliconflow.com/v1";
const DEFAULT_SILICONFLOW_MODEL = "moonshotai/Kimi-K2.5";
const DEFAULT_MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MOONSHOT_MODEL = "moonshot-v1-32k";

function isSiliconFlowUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "api.siliconflow.com" || hostname === "api.siliconflow.cn";
  } catch {
    return false;
  }
}

function resolveKimiProvider(): KimiProvider {
  const explicit = process.env.KIMI_PROVIDER?.trim().toLowerCase();
  if (explicit === "moonshot") return "moonshot";
  if (explicit === "siliconflow") return "siliconflow";

  const hasDedicatedSiliconFlowKey = Boolean(process.env.SILICONFLOW_API_KEY?.trim());
  const hasSiliconFlowEmbeddingAccount =
    Boolean(process.env.EMBEDDING_API_KEY?.trim()) && isSiliconFlowUrl(process.env.EMBEDDING_BASE_URL);
  return hasDedicatedSiliconFlowKey || hasSiliconFlowEmbeddingAccount ? "siliconflow" : "moonshot";
}

export function getKimiConfig() {
  const provider = resolveKimiProvider();
  if (provider === "siliconflow") {
    const embeddingBaseUrl = process.env.EMBEDDING_BASE_URL;
    const canReuseEmbeddingKey = isSiliconFlowUrl(embeddingBaseUrl);
    return {
      provider,
      apiKey:
        process.env.SILICONFLOW_API_KEY ||
        (canReuseEmbeddingKey ? process.env.EMBEDDING_API_KEY : undefined),
      baseUrl:
        process.env.SILICONFLOW_BASE_URL ||
        (canReuseEmbeddingKey ? embeddingBaseUrl : undefined) ||
        DEFAULT_SILICONFLOW_BASE_URL,
      model: process.env.SILICONFLOW_KIMI_MODEL || DEFAULT_SILICONFLOW_MODEL,
    };
  }

  return {
    provider,
    apiKey: process.env.KIMI_API_KEY,
    baseUrl: process.env.KIMI_BASE_URL || DEFAULT_MOONSHOT_BASE_URL,
    model: process.env.KIMI_MODEL || DEFAULT_MOONSHOT_MODEL,
  };
}

export function isKimiConfigured() {
  return Boolean(getKimiConfig().apiKey);
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
    throw new Error(`Missing ${config.provider} Kimi API key`);
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

const DEFAULT_MOONSHOT_VISION_MODEL = "moonshot-v1-8k-vision-preview";

export function getKimiVisionModel() {
  const config = getKimiConfig();
  if (config.provider === "siliconflow") {
    return process.env.SILICONFLOW_KIMI_VISION_MODEL || config.model;
  }
  return process.env.KIMI_VISION_MODEL || DEFAULT_MOONSHOT_VISION_MODEL;
}

/**
 * Multimodal: describe an uploaded image via SiliconFlow Kimi-K2.5 by default
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
    throw new Error(`Missing ${config.provider} Kimi API key`);
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
