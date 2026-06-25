import { REASONING_OPEN, REASONING_CLOSE } from "./stream-markers";

const OPEN_TO_CLOSE: Record<string, string> = {
  "(": ")",
  "（": "）",
  "[": "]",
  "【": "】",
  "{": "}",
  "「": "」",
  "『": "』",
  "《": "》",
  "〈": "〉",
  "<": ">",
  "＜": "＞"
};

const CLOSING = new Set(Object.values(OPEN_TO_CLOSE));

const AI_PHRASE_PATTERNS = [
  /作为(?:一个|一名)?(?:AI|人工智能|语言模型)[，,。；;\s]*/gi,
  /我(?:只是|是)?(?:一个|一名)?(?:AI|人工智能|语言模型)[，,。；;\s]*/gi,
  /AI助手[，,。；;\s]*/gi,
  /大语言模型[，,。；;\s]*/gi
];

const TEMPLATE_LABEL_PATTERNS = [
  /^(?:专业理解|现在先做|我想确认|心理机制|机制理解|小练习|练习|建议|回应|安全提示|总结)[:：]\s*/gm,
  /(?:首先|其次|最后|总之|综上)[，,：:]?\s*/g
];

function removeTemplatePhrases(text: string) {
  let cleaned = text;

  for (const pattern of AI_PHRASE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  for (const pattern of TEMPLATE_LABEL_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned;
}

function removeBracketedText(text: string) {
  const stack: string[] = [];
  let output = "";

  for (const char of text) {
    const closing = OPEN_TO_CLOSE[char];

    if (closing) {
      stack.push(closing);
      continue;
    }

    if (stack.length > 0) {
      if (char === stack.at(-1)) {
        stack.pop();
      }
      continue;
    }

    if (CLOSING.has(char) || "_＿﹍﹎﹏*#`".includes(char)) {
      continue;
    }

    output += char;
  }

  return output;
}

export function cleanAssistantText(text: string) {
  const cleaned = removeTemplatePhrases(removeBracketedText(text));

  return cleaned
    .replace(/[_＿﹍﹎﹏]+/g, "")
    .replace(/[*#`]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function createAssistantTextStream(source: ReadableStream<Uint8Array>) {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stack: string[] = [];

  function cleanChunk(text: string) {
    let output = "";

    for (const char of text) {
      const closing = OPEN_TO_CLOSE[char];

      if (closing) {
        stack.push(closing);
        continue;
      }

      if (stack.length > 0) {
        if (char === stack.at(-1)) {
          stack.pop();
        }
        continue;
      }

      if (CLOSING.has(char) || "_＿﹍﹎﹏*#`".includes(char)) {
        continue;
      }

      output += char;
    }

    return output;
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          const tail = removeTemplatePhrases(cleanChunk(decoder.decode()));
          if (tail) {
            controller.enqueue(encoder.encode(tail));
          }
          controller.close();
          return;
        }

        const cleaned = removeTemplatePhrases(cleanChunk(decoder.decode(value, { stream: true })));

        if (cleaned) {
          controller.enqueue(encoder.encode(cleaned));
          return;
        }
      }
    },
    cancel() {
      void reader.cancel();
    }
  });
}

// Quote-wrap marks the answer-cleaning must also strip (mirrors sanitizeReplyStream
// in http.ts, which the thinking path bypasses since it cleans inline).
const STRIP_WRAP_QUOTES = /[“”「」『』]/g;

/**
 * Like createAssistantTextStream, but reasoning-aware. The source stream is a deep-
 * tier reply whose leading 思考过程 block is delimited by REASONING_OPEN/CLOSE
 * (see deepseek.ts + stream-markers.ts). Everything up to and including
 * REASONING_CLOSE is forwarded RAW (the thinking is shown verbatim in its own
 * collapsible panel); everything after is the answer and gets the SAME cleaning the
 * normal path applies (createAssistantTextStream + sanitizeReplyStream), folded inline.
 * A stream with no markers (e.g. the model emitted no reasoning) is treated as all-answer.
 */
export function createAssistantTextStreamWithThinking(source: ReadableStream<Uint8Array>) {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stack: string[] = [];
  // Default ANSWER: a deep reply with no reasoning carries no markers and must be
  // cleaned like any normal reply. A REASONING_OPEN flips us into the raw thinking
  // phase until REASONING_CLOSE flips us back. (Mirrors the client-side parser.)
  let phase: "answer" | "thinking" = "answer";

  function cleanAnswer(text: string) {
    let output = "";
    for (const char of text) {
      const closing = OPEN_TO_CLOSE[char];
      if (closing) {
        stack.push(closing);
        continue;
      }
      if (stack.length > 0) {
        if (char === stack.at(-1)) {
          stack.pop();
        }
        continue;
      }
      if (CLOSING.has(char) || "_＿﹍﹎﹏*#`".includes(char)) {
        continue;
      }
      output += char;
    }
    return removeTemplatePhrases(output).replace(STRIP_WRAP_QUOTES, "");
  }

  // Process one decoded chunk across any number of phase boundaries. Reasoning is
  // forwarded raw (incl. the markers, which the client needs); the answer is cleaned.
  // Returns whether anything was enqueued, so the pull loop can keep reading on a
  // chunk that cleans to empty rather than emitting a spurious empty frame.
  function processChunk(text: string, controller: ReadableStreamDefaultController<Uint8Array>): boolean {
    let enqueued = false;
    let rest = text;
    while (rest.length) {
      if (phase === "answer") {
        const o = rest.indexOf(REASONING_OPEN);
        if (o === -1) {
          const cleaned = cleanAnswer(rest);
          if (cleaned) { controller.enqueue(encoder.encode(cleaned)); enqueued = true; }
          rest = "";
        } else {
          if (o > 0) {
            const cleaned = cleanAnswer(rest.slice(0, o));
            if (cleaned) { controller.enqueue(encoder.encode(cleaned)); enqueued = true; }
          }
          controller.enqueue(encoder.encode(REASONING_OPEN));
          enqueued = true;
          phase = "thinking";
          rest = rest.slice(o + 1);
        }
      } else {
        const c = rest.indexOf(REASONING_CLOSE);
        if (c === -1) {
          controller.enqueue(encoder.encode(rest));
          enqueued = true;
          rest = "";
        } else {
          if (c > 0) { controller.enqueue(encoder.encode(rest.slice(0, c))); enqueued = true; }
          controller.enqueue(encoder.encode(REASONING_CLOSE));
          enqueued = true;
          phase = "answer";
          rest = rest.slice(c + 1);
        }
      }
    }
    return enqueued;
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (phase === "answer") {
            const tail = cleanAnswer(decoder.decode());
            if (tail) controller.enqueue(encoder.encode(tail));
          }
          controller.close();
          return;
        }

        const text = decoder.decode(value, { stream: true });
        if (!text) continue;
        if (processChunk(text, controller)) return;
      }
    },
    cancel() {
      void reader.cancel();
    }
  });
}
