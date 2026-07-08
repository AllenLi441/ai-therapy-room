// Canonical "holding preface" lines that the chat route prepends to a reply
// (see localPreface in src/app/api/chat/route.ts). They are emitted instantly so
// the user sees a calm opener while the model connects.
//
// PROBLEM they cause: the frontend stores the full assistant reply (preface +
// model text) and sends it back as history. Over several turns the model sees its
// own prior turns all opening with the same line and starts MIMICKING it — so the
// deterministic preface + the model's echo render the line TWICE (observed on
// turns 4–5 of a live multi-turn test, 2026-06-09).
//
// FIX: strip these known prefaces from assistant history before sending it to the
// model, so there is nothing to mimic. The route still adds one fresh preface.
// MUST mirror the strings returned by localPreface().
export const KNOWN_PREFACES = [
  "I am here with you. I will keep this steady and safety-focused while we sort out the next step.",
  "I am going to take this carefully. Let us first stay with the immediate feeling, then sort the next step.",
  "I am here with you. Let us slow this down together.",
  "我先陪你把现在这一下稳住，再一起看下一步。",
  "我先确认一下：这句话是夸张表达，还是你真的担心自己会伤害自己？",
  "我先陪你把这件事放慢一点，我们一点点说。"
];

// Remove any leading run of known prefaces (handles an already-doubled stored
// message) plus the whitespace that followed them. Returns the substantive reply.
export function stripLeadingPreface(content: string): string {
  let s = content.replace(/^\s+/, "");
  for (let guard = 0; guard < 5; guard++) {
    const hit = KNOWN_PREFACES.find((p) => s.startsWith(p));
    if (!hit) break;
    s = s.slice(hit.length).replace(/^\s+/, "");
  }
  return s;
}
