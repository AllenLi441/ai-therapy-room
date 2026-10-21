import type { AppLanguage } from "./languages";
import { createDiagnosisBoundaryResponse, createMedicationBoundaryResponse, createSuicideConcernResponse } from "./safety";
import { EVENT_DELIM, REASONING_CLOSE, REASONING_OPEN } from "./stream-markers";

/**
 * Last check on the model's own words. The safety pipeline judges what the user said; this
 * catches a reply that slips anyway: method or lethal-dose detail, a drug dose or dose
 * change, a definite diagnosis, or (for minors) romantic role-play. The reply is streamed
 * with its last few characters held back; on a hit the rest is dropped, a `retract` event
 * tells the browser to replace the reply with a fixed text, and the stream ends.
 */
export type GuardKind = "means" | "medication" | "diagnosis" | "romance";

const DRUGS = "舍曲林|帕罗西汀|氟西汀|艾司西酞普兰|西酞普兰|氟伏沙明|文拉法辛|度洛西汀|米氮平|安非他酮|阿戈美拉汀|曲唑酮|阿普唑仑|劳拉西泮|氯硝西泮|地西泮|艾司唑仑|佐匹克隆|右佐匹克隆|唑吡坦|奥氮平|喹硫平|利培酮|阿立哌唑|碳酸锂|丙戊酸|拉莫三嗪|褪黑素|安眠药|抗抑郁药|sertraline|paroxetine|fluoxetine|escitalopram|citalopram|venlafaxine|duloxetine|mirtazapine|bupropion|trazodone|alprazolam|lorazepam|clonazepam|diazepam|zolpidem|quetiapine|olanzapine|lithium";
const DOSE = "\\d+(?:\\.\\d+)?\\s*(?:mg|毫克|克|片|粒|颗)";
const DIAGNOSES = "抑郁症|焦虑症|双相情感障碍|双相|躁郁症|精神分裂症|强迫症|创伤后应激障碍|PTSD|人格障碍|边缘型人格|进食障碍|厌食症|暴食症|多动症|ADHD";

const RULES: Array<{ kind: GuardKind; pattern: RegExp; minorOnly?: boolean }> = [
  { kind: "means", pattern: /致死(?:剂)?量|lethal dose/i },
  { kind: "means", pattern: /(?:吃|服|吞)[^。！？\n]{0,8}\d+\s*(?:片|粒|颗|瓶)[^。！？\n]{0,8}(?:就|会|能|可以)[^。！？\n]{0,6}(?:死|没命|致命)/ },
  { kind: "means", pattern: /(?:割腕|上吊|跳楼|烧炭|服毒|自缢)[^。！？\n]{0,10}(?:的方法|步骤|怎么做|最快|不疼|无痛|成功率)/ },
  { kind: "means", pattern: /(?:多高|几楼)[^。！？\n]{0,6}(?:才能|就能|一定|才会)[^。！？\n]{0,4}死/ },
  { kind: "medication", pattern: new RegExp(`(?:${DRUGS})[^。！？.\\n]{0,24}${DOSE}|${DOSE}[^。！？.\\n]{0,8}(?:${DRUGS})`, "i") },
  { kind: "medication", pattern: /(?:可以|建议|试着|不妨|先)(?:自己)?(?:停药|减药|加药|换药|停掉|减量|加量)/ },
  { kind: "diagnosis", pattern: new RegExp(`(?:你|您)(?:这|这个情况|的情况)?(?:就|肯定|确实|已经|明显)?(?:是|得了|患了|患有|有)(?:${DIAGNOSES})`) },
  { kind: "diagnosis", pattern: /\byou (?:clearly |definitely )?(?:have|are suffering from) (?:depression|bipolar disorder|schizophrenia|ocd|ptsd|adhd|an eating disorder)\b/i },
  { kind: "romance", pattern: /(?:做|当)你的?(?:男朋友|女朋友|对象|恋人|老公|老婆)|我爱你|亲爱的|宝贝|\b(?:be your (?:boyfriend|girlfriend)|i love you)\b/i, minorOnly: true },
];
// A hedged, negated, conditional or questioning mention is fine: "这不代表你得了抑郁症",
// "如果你有焦虑症…", "你有焦虑症的表现吗？".
const HEDGE = /(?:不|没|并非|无法|不能|是否|可能|也许|或许|不一定|判断|如果|假如|就算|即使|担心|怕|not|n't|may|might|if)[^。！？\n]{0,8}$/i;
const QUESTION = /^[^。！？\n]{0,10}(?:吗|么|？|\?|的话)/;

export function findGuardHit(text: string, opts: { minor?: boolean } = {}): GuardKind | null {
  for (const rule of RULES) {
    if (rule.minorOnly && !opts.minor) continue;
    const match = rule.pattern.exec(text);
    if (!match) continue;
    if (rule.kind === "diagnosis" && (HEDGE.test(text.slice(Math.max(0, match.index - 12), match.index)) ||
      QUESTION.test(text.slice(match.index + match[0].length)))) continue;
    return rule.kind;
  }
  return null;
}

const ROMANCE_TEXT: Partial<Record<AppLanguage, string>> & { zh: string; en: string } = {
  zh: "我是 AI 陪伴者，不能扮演男女朋友，也不会说这类话。你愿意的话，我们继续聊聊你现在的感受。",
  "zh-Hant": "我是 AI 陪伴者，不能扮演男女朋友，也不會說這類話。你願意的話，我們繼續聊聊你現在的感受。",
  en: "I'm an AI companion, so I can't act as a boyfriend or girlfriend or talk that way. If you'd like, we can keep talking about how you're feeling.",
  ja: "わたしはAIの話し相手なので、恋人の役はできませんし、そういう言葉も使いません。よければ、いまの気持ちの話を続けましょう。",
  ko: "저는 AI 대화 상대라서 연인 역할을 하거나 그런 말을 할 수 없어요. 괜찮다면 지금 어떤 기분인지 계속 이야기해요.",
  es: "Soy un acompañante de IA, así que no puedo hacer de novio o novia ni hablar así. Si quieres, seguimos hablando de cómo te sientes.",
  fr: "Je suis un compagnon IA : je ne peux pas jouer le rôle d’un petit ami ou d’une petite amie, ni parler ainsi. Si tu veux, continuons à parler de ce que tu ressens.",
  de: "Ich bin ein KI-Begleiter und kann nicht deinen Freund oder deine Freundin spielen oder so reden. Wenn du magst, sprechen wir weiter darüber, wie es dir geht.",
};

export function guardReplacement(kind: GuardKind, language: AppLanguage): string {
  if (kind === "means") return createSuicideConcernResponse(language);
  if (kind === "medication") return createMedicationBoundaryResponse(language);
  if (kind === "diagnosis") return createDiagnosisBoundaryResponse(language);
  return ROMANCE_TEXT[language] ?? ROMANCE_TEXT.en;
}

const HOLD = 24;

/** Wraps an answer stream (thinking markers pass straight through). */
export function guardReplyStream(stream: ReadableStream<Uint8Array>, opts: { language: AppLanguage; minor?: boolean }): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let answer = "";     // everything the model wrote so far
  let released = 0;    // how much of it has been sent
  let done = false;
  let failure: unknown = null; // upstream error, passed on after the held text is released
  return new ReadableStream<Uint8Array>({
    // Loops until it has something to send: a pull that enqueues nothing is never called again.
    async pull(controller) {
      for (;;) {
        if (failure) throw failure;
        if (done) { controller.close(); return; }
        let value: Uint8Array | undefined, ended = false;
        try {
          ({ value, done: ended } = await reader.read());
        } catch (error) {
          // Keep the partial reply the user already half-saw (if it is clean), then fail.
          failure = error;
          ended = true;
        }
        let out = "";
        if (!ended && value) {
          for (const char of decoder.decode(value, { stream: true })) {
            if (char === REASONING_OPEN || char === REASONING_CLOSE) out += char;
            else answer += char;
          }
        }
        const kind = findGuardHit(answer, opts);
        if (kind) {
          done = true;
          void reader.cancel().catch(() => {});
          const event = { type: "retract", kind, text: guardReplacement(kind, opts.language) };
          controller.enqueue(encoder.encode(out + EVENT_DELIM + JSON.stringify(event) + EVENT_DELIM));
          if (kind === "means") controller.enqueue(encoder.encode(EVENT_DELIM + JSON.stringify({ type: "safety", status: "suicide_concern" }) + EVENT_DELIM));
          controller.close();
          return;
        }
        const upTo = ended ? answer.length : Math.max(released, answer.length - HOLD);
        out += answer.slice(released, upTo);
        released = upTo;
        if (ended) {
          done = true;
          if (out) controller.enqueue(encoder.encode(out));
          if (!failure) controller.close();
          return;
        }
        if (out) { controller.enqueue(encoder.encode(out)); return; }
      }
    },
    cancel() { void reader.cancel().catch(() => {}); }
  });
}
