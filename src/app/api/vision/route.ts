import { describeImageWithKimi, isKimiConfigured } from "@/lib/kimi";
import { checkRateLimit, rateLimitResponse, readRateLimitEnv } from "@/lib/rate-limit";

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

// ~6MB image → ~8MB as base64. Guards the request and the Kimi call.
const MAX_IMAGE_CHARS = 8_000_000;

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
      { error: "vision_unavailable", description: "图片理解暂不可用（未配置 Kimi 服务密钥）。" },
      { status: 503 }
    );
  }

  let body: VisionRequest;
  try {
    body = (await request.json()) as VisionRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const image = body.image?.trim();
  if (!image || !image.startsWith("data:image/")) {
    return Response.json({ error: "expected an image as a data:image/* base64 URL" }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "image too large (max ~6MB)" }, { status: 413 });
  }

  try {
    const description = await describeImageWithKimi({ imageDataUrl: image, prompt: body.prompt });
    return Response.json({ description });
  } catch (error) {
    console.error("[vision] failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "vision_failed", description: "" }, { status: 502 });
  }
}
