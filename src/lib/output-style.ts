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
