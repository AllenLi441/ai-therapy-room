import { describe, it, expect } from "vitest";
import { appendParallelSafety, prependEventToStream } from "./http";
import { EVENT_DELIM } from "./stream-markers";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
      else c.close();
    }
  });
}

async function readAll(s: ReadableStream<Uint8Array>): Promise<string> {
  const r = s.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  out += dec.decode();
  return out;
}

const ev = (o: unknown) => `${EVENT_DELIM}${JSON.stringify(o)}${EVENT_DELIM}`;

describe("prependEventToStream (deep mode: leading safety event)", () => {
  it("emits the event first, then the source", async () => {
    const out = await readAll(prependEventToStream(streamFrom(["hello world"]), { type: "safety", status: "safe" }));
    expect(out).toBe(ev({ type: "safety", status: "safe" }) + "hello world");
  });
});

describe("appendParallelSafety (fast mode: answer first, judge result trailing)", () => {
  it("streams the answer, then a trailing safe event (no intervention)", async () => {
    const out = await readAll(
      appendParallelSafety(streamFrom(["the ", "answer"]), async () => ({ event: { type: "safety", status: "safe" } }))
    );
    expect(out).toBe("the answer" + ev({ type: "safety", status: "safe" }));
  });

  it("appends the intervention AFTER the answer when the judge flags danger", async () => {
    const out = await readAll(
      appendParallelSafety(streamFrom(["a calm reply"]), async () => ({
        event: { type: "safety", status: "crisis" },
        intervention: "热线 12356"
      }))
    );
    expect(out).toContain(ev({ type: "safety", status: "crisis" }));
    expect(out).toContain("热线 12356");
    expect(out.indexOf("a calm reply")).toBeLessThan(out.indexOf("热线 12356"));
  });

  it("falls back to an 'unchecked' event if the safety resolver throws", async () => {
    const out = await readAll(
      appendParallelSafety(streamFrom(["x"]), async () => {
        throw new Error("judge blew up");
      })
    );
    expect(out).toContain("unchecked");
    expect(out.startsWith("x")).toBe(true);
  });
});
