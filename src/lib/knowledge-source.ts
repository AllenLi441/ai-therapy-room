// A source's institutional identity is necessary but does not validate every claim.
// Local cards also require recorded source review; remote clinical cards still require
// their existing professional approval status. Web snippets remain unreviewed snippets.
export const TRUSTED_KNOWLEDGE_DOMAINS = [
  "who.int", "nih.gov", "nhs.uk", "nhsinform.scot", "apa.org", "psychiatry.org",
  "cdc.gov", "cochranelibrary.com", "mayoclinic.org", "my.clevelandclinic.org",
];

export function isTrustedKnowledgeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") &&
      TRUSTED_KNOWLEDGE_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
