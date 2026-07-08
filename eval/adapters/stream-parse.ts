import { EVENT_DELIM, REASONING_OPEN, REASONING_CLOSE } from "@/lib/stream-markers";

export type ChatEvent = { type: string; status?: string; [k: string]: unknown };

export function parseChatStream(fullText: string): {
  text: string; events: ChatEvent[]; reasoning: string;
} {
  // 1) 剥思考块:REASONING_OPEN…REASONING_CLOSE 之间为 reasoning,从正文移除
  let reasoning = "";
  let body = fullText;
  const openIdx = body.indexOf(REASONING_OPEN);
  if (openIdx !== -1) {
    const closeIdx = body.indexOf(REASONING_CLOSE, openIdx);
    if (closeIdx !== -1) {
      reasoning = body.slice(openIdx + REASONING_OPEN.length, closeIdx);
      body = body.slice(0, openIdx) + body.slice(closeIdx + REASONING_CLOSE.length);
    } else {
      // 退化情形:思考块未闭合(流被截断),剩余部分整体视为 reasoning
      reasoning = body.slice(openIdx + REASONING_OPEN.length);
      body = body.slice(0, openIdx);
    }
  }

  // 2) 剩余按 EVENT_DELIM split;每段 trim 后以 "{" 开头且 JSON.parse 成功且有
  //    string 型 .type → 计入 events;否则拼回正文 text
  const segments = body.split(EVENT_DELIM);
  const events: ChatEvent[] = [];
  let text = "";
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed && typeof parsed.type === "string") {
          events.push(parsed as ChatEvent);
          continue;
        }
      } catch {
        // 不是合法 JSON —— 落回正文
      }
    }
    text += segment;
  }
  return { text, events, reasoning };
}
