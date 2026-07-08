import { buildDeepSeekPayload, generateDeepSeekText } from "./deepseek";

const SYSTEM_PROMPT =
  "把下面这段来访者的口语化倾诉压缩成一句用于检索心理健康知识库的中文查询。保留症状、主题、场景关键词，去掉人名与叙事细节。只输出查询本身，不加任何说明。";

// Same race-against-a-deadline shape as knowledge.ts's withDeadline: never throws,
// never hangs the reply — resolves null on timeout OR rejection so the caller always
// has a clean fail-safe path back to the original text.
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

/** 深度模式检索前的查询改写:把口语化倾诉压成检索式查询。失败/超时 → 返回原文(fail-safe)。 */
export async function rewriteRetrievalQuery(raw: string, timeoutMs = 2_500): Promise<string> {
  if (!raw || !raw.trim()) return raw;

  try {
    const payload = buildDeepSeekPayload({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: raw }],
      apiModel: "deepseek-v4-flash", // fast/cheap tier — this is a small pre-processing step, not the reply
      stream: false,
      maxTokens: 60
    });
    const result = await withDeadline(generateDeepSeekText(payload), timeoutMs);
    if (!result) return raw; // timeout / rejection — fail-safe

    const trimmed = result.trim();
    if (!trimmed) return raw; // empty result — fail-safe
    if (trimmed.length > 120) return raw; // ran away — fail-safe (guard against a runaway completion)

    return trimmed;
  } catch {
    return raw;
  }
}
