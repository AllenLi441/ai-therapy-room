export function textStreamFromString(text: string) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
}

/**
 * Append a fixed suffix to the END of a text stream — used for the §3 global safety
 * footer on streamed replies. Reads the source through, then emits `suffix` once.
 */
export function appendToStream(stream: ReadableStream<Uint8Array>, suffix: string): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(encoder.encode(suffix));
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      void reader.cancel();
    }
  });
}

export function streamTextResponse(stream: ReadableStream<Uint8Array>, extraHeaders?: Record<string, string>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}
