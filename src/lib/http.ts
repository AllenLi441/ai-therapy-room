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

// The model is told never to quote-wrap guessed words (e.g. 那份"考不好"的担心), but
// it slips sometimes. This is the deterministic backstop: strip full-width double
// quotes and corner brackets from the streamed reply so the wrapping marks never
// reach the user — only the marks are removed, the words stay (→ 那份考不好的担心).
const STRIP_WRAP = /[“”「」『』]/g;
export function sanitizeReplyStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = decoder.decode(); // flush any buffered partial multibyte char
        if (tail) controller.enqueue(encoder.encode(tail.replace(STRIP_WRAP, "")));
        controller.close();
        return;
      }
      // stream:true buffers an incomplete trailing char so a quote split across
      // chunks is still seen whole before the regex runs.
      const text = decoder.decode(value, { stream: true });
      controller.enqueue(encoder.encode(text.replace(STRIP_WRAP, "")));
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
