/**
 * scripts/ingest/clean.mjs — DOM-free HTML → ordered content blocks.
 * Deliberately simple/regex-based (repo style, zero deps): drop non-content containers,
 * keep h1-h3 + p/li text in document order. Pure + deterministic.
 */
import { decodeEntities, normalizeForMatch } from "./util.mjs";

const DROP_CONTAINERS = /<(script|style|noscript|svg|template|nav|header|footer|aside|form|iframe|button)\b[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;

// class/id patterns that mark boilerplate wrappers (best-effort; the chunker's
// text-level blocklist is the second net)
const BOILER_ATTR = /class="[^"]*(cookie|consent|breadcrumb|share|social|newsletter|subscribe|sidebar|menu|banner|skip)[^"]*"/i;

/** → [{ type:'heading', level, text } | { type:'text', text }] in document order */
export function cleanHtml(rawHtml) {
  let s = String(rawHtml ?? "").replace(COMMENTS, " ").replace(DROP_CONTAINERS, " ");

  const blocks = [];
  const tagRe = /<(h1|h2|h3|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = tagRe.exec(s)) !== null) {
    const [, tag, attrs, inner] = m;
    if (BOILER_ATTR.test(attrs)) continue;
    const text = normalizeForMatch(decodeEntities(inner.replace(/<[^>]+>/g, " ")));
    if (!text) continue;
    if (/^h[1-3]$/.test(tag)) {
      blocks.push({ type: "heading", level: Number(tag[1]), text });
    } else {
      blocks.push({ type: "text", text });
    }
  }
  return blocks;
}
