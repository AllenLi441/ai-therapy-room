import { describeImageWithKimi, isKimiConfigured } from "@/lib/kimi";
import { checkRateLimit, rateLimitResponse, readRateLimitEnv } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES, MAX_IMAGE_BASE64_CHARS, MAX_VISION_REQUEST_BYTES } from "@/lib/media-limits";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Multimodal image intake (2026-06-13). The "+" button uploads an image; Kimi
 * (SiliconFlow Kimi-K2.5 by default) vision returns a plain-language description, which the frontend
 * then sends into /api/chat as context so the (text-only) DeepSeek conversation
 * can respond to it AND the normal risk-detection layer screens it.
 *
 * Images only — this route does not accept video. Expects a base64 data URL.
 */
type VisionRequest = {
  image?: string; // data:image/...;base64,....
  prompt?: string;
};

export async function POST(request: Request) {
  const limit = checkRateLimit(request, {
    keyPrefix: "vision",
    ...readRateLimitEnv("VISION_RATE_LIMIT_MAX", "VISION_RATE_LIMIT_WINDOW_MS", 12, 60_000)
  });
  if (!limit.allowed) {
    return rateLimitResponse(limit);
  }

  if (!isKimiConfigured()) {
    return Response.json(
      { error: "vision_unavailable", message: "图片理解暂不可用，请稍后重试或先发送文字。", retryable: true },
      { status: 503 }
    );
  }

  let body: VisionRequest;
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "missing_image", retryable: false }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_VISION_REQUEST_BYTES) {
        void reader.cancel();
        return Response.json({ error: "image_too_large", message: "图片最大为 3 MiB。", retryable: false }, { status: 413 });
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as VisionRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || typeof body.image !== "string" ||
      (body.prompt !== undefined && (typeof body.prompt !== "string" || body.prompt.length > 1000))) {
    return Response.json({ error: "invalid_image", retryable: false }, { status: 400 });
  }
  const image = body.image.trim();
  const parts = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/]*={0,2})$/i.exec(image);
  if (!parts || !parts[1] || parts[1].length % 4 !== 0) {
    return Response.json({ error: "invalid_image", message: "请选择有效图片。", retryable: false }, { status: 400 });
  }
  const data = parts[1];
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const decodedBytes = data.length / 4 * 3 - padding;
  if (data.length > MAX_IMAGE_BASE64_CHARS || decodedBytes > MAX_IMAGE_BYTES) {
    return Response.json({ error: "image_too_large", message: "图片最大为 3 MiB。", retryable: false }, { status: 413 });
  }

  try {
    const description = await describeImageWithKimi({ imageDataUrl: image, prompt: body.prompt });
    if (!description.trim()) throw new Error("empty image description");
    return Response.json({ description });
  } catch {
    return Response.json({ error: "vision_failed", message: "图片没能读完，请重试或先发送文字。", retryable: true }, { status: 502 });
  }
}
