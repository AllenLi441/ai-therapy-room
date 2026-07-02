/**
 * scripts/ingest/verify-quote.mjs — pick + machine-verify one verbatim quote per chunk.
 *
 * The contract (knowledge-cards.ts:3-9): sourceQuote is a VERBATIM excerpt a human can
 * re-find on the page — verification failure keeps the URL and DROPS the quote, NEVER
 * fabricates. The check is real, not a tautology: candidates come from the clean/chunk
 * pipeline, but they are verified against minimalTextFromHtml(rawHtml) — an INDEPENDENT
 * minimal tag-strip of the same fetched bytes (no block dropping, no reflow). If cleaning
 * mangled a sentence (entity mis-decode, merged blocks), it won't match and is dropped.
 */
import { normalizeForMatch } from "./util.mjs";

const QUOTE_BOILER = [
  /skip to|sign ?up|subscribe|newsletter|cookie|share this|all rights reserved/i,
  /^(首页|导航|分享|订阅|打印)/,
  // 引文/参考文献句不配当「逐字引用」——带 URL、DOI、出版年份标记的都排除
  /https?:\/\/|www\.|doi[.:]|et al\.?|\(\s*20\d\d\s*\)|;\s*20\d\d|访问\s*[)）]|accessed/i
];

function candidateOk(s, lang) {
  if (s.length < 40 || s.length > 220) return false;
  if (QUOTE_BOILER.some((re) => re.test(s))) return false;
  if (lang === "zh") return /[一-鿿]{10,}/.test(s);      // 真正的中文句子
  return s.split(/\s+/).length >= 6;                              // 至少 6 个英文词
}

/**
 * @returns { sourceQuote?: string, quoteStatus: 'verified'|'dropped_unverified'|'no_candidate' }
 */
export function selectAndVerifyQuote(passage, pageTextNormalized, lang) {
  const re = lang === "zh" ? /[^。！？；]+[。！？；]?/g : /[^.!?]+[.!?]?/g;
  const sentences = (String(passage).match(re) ?? [])
    .map((s) => s.trim())
    .filter((s) => candidateOk(s, lang))
    .sort((a, b) => b.length - a.length); // 最长的最有辨识度

  if (sentences.length === 0) return { quoteStatus: "no_candidate" };

  for (const candidate of sentences) {
    if (pageTextNormalized.includes(normalizeForMatch(candidate))) {
      return { sourceQuote: candidate, quoteStatus: "verified" };
    }
  }
  return { quoteStatus: "dropped_unverified" }; // URL 保留,引用绝不编造
}
