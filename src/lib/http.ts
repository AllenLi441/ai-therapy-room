import { EVENT_DELIM } from "./stream-markers";

/** Encode a process event (e.g. the safety-check result) as an in-stream RS-wrapped JSON token. */
function encodeEvent(event: unknown): string {
  return EVENT_DELIM + JSON.stringify(event) + EVENT_DELIM;
}

/**
 * Prepend a single process event to a stream (used in DEEP mode, where the Kimi
 * danger-check has already resolved before the reply streams — so the client can show
 * "🛡 安全识别 ✓" from the very start).
 */
export function prependEventToStream(
  stream: ReadableStream<Uint8Array>,
  event: unknown
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = stream.getReader();
  let sentPrefix = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentPrefix) {
        sentPrefix = true;
        controller.enqueue(encoder.encode(encodeEvent(event)));
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
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

/**
 * FAST-mode parallel safety: stream the answer immediately, and once it finishes await
 * the (concurrently-running) Kimi danger check. Emit its result as a trailing event and,
 * if it flags danger the instant lexicon floor missed, append a vetted intervention. This
 * is what lets fast replies land in seconds while the implicit-risk net still closes —
 * just a few seconds later, which is the accepted product trade-off for fast mode.
 */
export function appendParallelSafety(
  answerStream: ReadableStream<Uint8Array>,
  resolveSafety: () => Promise<{ event: unknown; intervention?: string }>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = answerStream.getReader();
  let answerDone = false;
  let tailSent = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!answerDone) {
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        answerDone = true;
      }
      if (!tailSent) {
        tailSent = true;
        let tail = "";
        try {
          const { event, intervention } = await resolveSafety();
          tail = encodeEvent(event);
          if (intervention) tail += "\n\n" + intervention;
        } catch {
          tail = encodeEvent({ type: "safety", status: "unchecked" });
        }
        controller.enqueue(encoder.encode(tail));
        return;
      }
      controller.close();
    },
    cancel() {
      void reader.cancel();
    }
  });
}

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
