/**
 * scripts/ingest/chunk.mjs — heading-aware section chunker with provenance.
 * Pure + deterministic (stable ordinals → stable point ids).
 *
 * Safety gates baked in (critic must-fixes):
 *   - text-level boilerplate blocklist (nav/CTA lines never become content);
 *   - diagnostic-criteria checklists EXCLUDED entirely (spec §2 non-goal: the product
 *     must not feed self-diagnosis thresholds; runtime prompt guard is the second net).
 */
import { contentHash } from "./util.mjs";

const BOILERPLATE = [
  /skip to (main )?content/i, /sign ?up|subscribe|newsletter/i, /^share( this)?/i,
  /^print$/i, /all rights reserved|©/i, /^related (topics|content|links)/i,
  /cookies?|privacy policy|terms of use/i, /^last (reviewed|updated)/i, /^page last/i,
  /^was this page helpful/i, /^en español/i, /^español/i,
  /^(首页|导航|分享|订阅|打印|相关链接|相关主题|返回顶部|上一页|下一页)$/,
  /扫一扫|关注我们|微信公众号/,
  // US-gov site banner (CDC/NIMH pages)
  /\.gov website belongs to|official government organization|A lock \(|secure websites|you('|’)ve safely connected/i
];

// meta sections that are page apparatus, not psychoeducation content
const SKIP_SECTIONS = /^(references|参考文献|citations?|bibliography|further reading|延伸阅读|related (topics|pages)|相关阅读)/i;

// e.g. "five (or more) of the following", "以下症状中至少五项/5项", "符合其中X项"
const CRITERIA_CHECKLIST = [
  /five or more of the following|at least (four|five|\d) of the following/i,
  /diagnostic criteria/i,
  /以下(症状|表现|条目)?中?(的)?(至少|超过)?(四|五|4|5|\d)项/,
  /符合(其中|以下|上述).{0,6}项/,
  /(才能|即可|方可)诊断/
];

const isBoiler = (t) => BOILERPLATE.some((re) => re.test(t));
const isCriteria = (t) => CRITERIA_CHECKLIST.some((re) => re.test(t));

function splitSentences(text, lang) {
  const re = lang === "zh" ? /[^。！？；]+[。！？；]?/g : /[^.!?]+[.!?]?/g;
  return (text.match(re) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/**
 * blocks → [{ chunkPath, ordinal, title, passage, lang, contentHash }]
 * target ~450 chars zh / ~900 chars en per chunk; min 120; heading stack = chunkPath.
 */
export function chunkBlocks(blocks, { lang }) {
  const target = lang === "zh" ? 450 : 900;
  const min = 120;
  const stack = []; // heading texts by level
  const sections = []; // { path, texts[] }

  for (const b of blocks) {
    if (b.type === "heading") {
      if (isBoiler(b.text)) continue;
      stack[b.level - 1] = b.text;
      stack.length = b.level; // truncate deeper levels
      continue;
    }
    if (isBoiler(b.text)) continue;
    const path = stack.filter(Boolean).join(" › ") || "";
    const cur = sections[sections.length - 1];
    if (cur && cur.path === path) cur.texts.push(b.text);
    else sections.push({ path, texts: [b.text] });
  }

  const chunks = [];
  const seen = new Set();
  let excludedCriteria = 0;

  for (const sec of sections) {
    const leafHeading = sec.path.split(" › ").pop() || "";
    if (SKIP_SECTIONS.test(leafHeading)) continue; // 参考文献/相关阅读等页面装置整节跳过
    const sentences = sec.texts.flatMap((t) => splitSentences(t, lang));
    let buf = "";
    const flush = () => {
      const passage = buf.trim();
      buf = "";
      if (passage.length < min) return;
      if (isCriteria(passage)) { excludedCriteria += 1; return; } // 诊断清单:整块排除
      const hash = contentHash(passage);
      if (seen.has(hash)) return;
      seen.add(hash);
      const leaf = sec.path.split(" › ").pop() || "";
      chunks.push({
        chunkPath: sec.path || leaf || "正文",
        ordinal: chunks.length,
        title: leaf || sec.path || "",
        passage,
        lang,
        contentHash: hash
      });
    };
    for (const s of sentences) {
      if (buf.length + s.length > target && buf.length >= min) flush();
      buf += (buf ? (lang === "zh" ? "" : " ") : "") + s;
    }
    flush();
  }

  return { chunks, excludedCriteria };
}
