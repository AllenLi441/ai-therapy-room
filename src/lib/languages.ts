/** Interface + reply languages. Every language here has a complete UI dictionary, fixed
 * safety texts and starter prompts; the model is told to reply in `replyName`.
 * Validated instruments (PHQ-9 / GAD-7 / ISI) exist only in `content` (zh / en). */
export const LANGUAGES = [
  { code: "zh", native: "简体中文", content: "zh", replyName: "简体中文", speech: "zh-CN" },
  { code: "zh-Hant", native: "繁體中文", content: "zh", replyName: "繁體中文（正體字）", speech: "zh-TW" },
  { code: "en", native: "English", content: "en", replyName: "English", speech: "en-US" },
  { code: "ja", native: "日本語", content: "en", replyName: "日本語", speech: "ja-JP" },
  { code: "ko", native: "한국어", content: "en", replyName: "한국어", speech: "ko-KR" },
  { code: "es", native: "Español", content: "en", replyName: "español", speech: "es-ES" },
  { code: "fr", native: "Français", content: "en", replyName: "français", speech: "fr-FR" },
  { code: "de", native: "Deutsch", content: "en", replyName: "Deutsch", speech: "de-DE" },
] as const;

export type AppLanguage = typeof LANGUAGES[number]["code"];
/** The bilingual base used for content that only exists in Chinese and English. */
export type ContentLanguage = "zh" | "en";

export const LANGUAGE_CODES: readonly AppLanguage[] = LANGUAGES.map((language) => language.code);

export function parseLanguage(value: unknown): AppLanguage | null {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value) ? value as AppLanguage : null;
}

export function normalizeLanguage(value: unknown): AppLanguage {
  return parseLanguage(value) ?? "zh";
}

export function contentLanguage(language: AppLanguage): ContentLanguage {
  return LANGUAGES.find((item) => item.code === language)?.content ?? "zh";
}

/** BCP-47 tag for the browser's speech recognition. */
export function speechLanguage(language: AppLanguage): string {
  return LANGUAGES.find((item) => item.code === language)?.speech ?? "zh-CN";
}

export function replyLanguageName(language: AppLanguage): string {
  return LANGUAGES.find((item) => item.code === language)?.replyName ?? "简体中文";
}

/** Pick a localized value: exact language, else its zh/en content base. */
export function localized<T>(language: AppLanguage, table: { zh: T; en: T } & Partial<Record<AppLanguage, T>>): T {
  return table[language] ?? table[contentLanguage(language)];
}
