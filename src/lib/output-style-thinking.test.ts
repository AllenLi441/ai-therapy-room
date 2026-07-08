import { describe, it, expect } from "vitest";
import { createAssistantTextStreamWithThinking } from "./output-style";
import { REASONING_OPEN, REASONING_CLOSE } from "./stream-markers";

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

describe("createAssistantTextStreamWithThinking", () => {
  it("forwards reasoning RAW and cleans only the answer", async () => {
    const out = await readAll(
      createAssistantTextStreamWithThinking(
        streamFrom([REASONING_OPEN, "想法保留「括号」和*星号*", REASONING_CLOSE, "回答里「这段」要删，星号*也*删"])
      )
    );
    // Reasoning + both markers pass through untouched (brackets/markdown kept).
    expect(out).toContain(REASONING_OPEN + "想法保留「括号」和*星号*" + REASONING_CLOSE);
    // The answer (after the close marker) is cleaned: bracketed aside + markdown removed.
    const answer = out.slice(out.indexOf(REASONING_CLOSE) + 1);
    expect(answer).not.toContain("这段");
    expect(answer).not.toContain("*");
    expect(answer).toContain("回答里");
    expect(answer).toContain("要删");
  });

  it("treats a marker-less stream as all-answer and cleans it", async () => {
    const out = await readAll(
      createAssistantTextStreamWithThinking(streamFrom(["普通回答带一个「旁白」收尾"]))
    );
    expect(out).not.toContain(REASONING_OPEN);
    expect(out).not.toContain(REASONING_CLOSE);
    expect(out).not.toContain("旁白");
    expect(out).toContain("普通回答带一个");
  });

  it("handles the boundary marker split across chunks", async () => {
    const out = await readAll(
      createAssistantTextStreamWithThinking(
        streamFrom([REASONING_OPEN + "abc", "def" + REASONING_CLOSE + "答案"])
      )
    );
    expect(out).toContain(REASONING_OPEN + "abcdef" + REASONING_CLOSE);
    expect(out.slice(out.indexOf(REASONING_CLOSE) + 1)).toContain("答案");
  });
});
