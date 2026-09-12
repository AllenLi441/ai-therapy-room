import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { describeImageWithKimi, isKimiConfigured } from "@/lib/kimi";
import { MAX_IMAGE_BYTES, MAX_VISION_REQUEST_BYTES } from "@/lib/media-limits";
import { resetRateLimitForTests } from "@/lib/rate-limit";

vi.mock("@/lib/kimi", () => ({ describeImageWithKimi: vi.fn(), isKimiConfigured: vi.fn() }));
const request = (body: unknown) => new Request("http://localhost/api/vision", { method: "POST", body: JSON.stringify(body) });
const image = (bytes: number) => `data:image/png;base64,${Buffer.alloc(bytes).toString("base64")}`;
beforeEach(() => {
  vi.clearAllMocks(); resetRateLimitForTests();
  vi.mocked(isKimiConfigured).mockReturnValue(true);
  vi.mocked(describeImageWithKimi).mockResolvedValue("A blue square.");
});

describe("vision upload contract", () => {
  it("accepts exactly 3 MiB and rejects one additional raw byte before provider work", async () => {
    expect((await POST(request({ image: image(MAX_IMAGE_BYTES) }))).status).toBe(200);
    vi.mocked(describeImageWithKimi).mockClear();
    const response = await POST(request({ image: image(MAX_IMAGE_BYTES + 1) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "image_too_large", retryable: false });
    expect(describeImageWithKimi).not.toHaveBeenCalled();
  });

  it("bounds the whole JSON request, not only the image field", async () => {
    const response = await POST(request({ image: image(8), extra: "x".repeat(MAX_VISION_REQUEST_BYTES) }));
    expect(response.status).toBe(413);
    expect(describeImageWithKimi).not.toHaveBeenCalled();
  });

  it("rejects invalid shapes and invalid base64 without throwing", async () => {
    for (const body of [null, {}, { image: 7 }, { image: "data:image/png;base64,?" }, { image: image(4), prompt: [] }]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(describeImageWithKimi).not.toHaveBeenCalled();
  });

  it("never labels an unavailable provider or provider error as an image description", async () => {
    vi.mocked(isKimiConfigured).mockReturnValueOnce(false);
    const unavailable = await POST(request({ image: image(4) }));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: "vision_unavailable", retryable: true });
    vi.mocked(describeImageWithKimi).mockRejectedValueOnce(new Error("private-provider-details"));
    const failed = await POST(request({ image: image(4) }));
    const body = await failed.json();
    expect(failed.status).toBe(502);
    expect(body.description).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("private-provider-details");
  });

  it("treats an empty provider description as a retryable failure", async () => {
    vi.mocked(describeImageWithKimi).mockResolvedValueOnce("   ");
    const response = await POST(request({ image: image(4) }));
    expect(response.status).toBe(502);
    expect((await response.json()).description).toBeUndefined();
  });
});
