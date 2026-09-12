import { CN_PRIMARY_HOTLINES, CN_SUPPLEMENTAL, INTL_RESOURCES } from "./crisis-resources";

/** Shared by the browser, record backups, request validation and safety prompts. */
export const SUPPORT_REGION_CODES = ["CN", "HK", "MO", "TW", "US", "CA", "UK", "IE", "AU", "NZ", "SG", "JP", "KR", "FR", "DE", "OTHER"] as const;
export type SelectableSupportRegion = typeof SUPPORT_REGION_CODES[number];
// Keep the old combined selection until the user explicitly chooses a country.
export type SupportRegion = SelectableSupportRegion | "UK_IE";
export type SupportRegionInput = SupportRegion | Lowercase<SupportRegion>;
type LocalizedLabel = { zh: string; en: string };
export type SupportResource = {
  kind: "crisis" | "emergency" | "directory" | "youth";
  label: LocalizedLabel;
  href: string;
  number?: string;
  note?: LocalizedLabel;
  sourceUrl?: string;
};
type SupportRegionDefinition = { label: LocalizedLabel; resources: SupportResource[]; minorResources?: SupportResource[] };

const directory: SupportResource = {
  kind: "directory", label: { zh: "查找当地支持", en: "Find local support" }, href: `https://${INTL_RESOURCES.finder}`, sourceUrl: `https://${INTL_RESOURCES.finder}`,
};
const region = (zh: string, en: string, resources: SupportResource[] = [directory]): SupportRegionDefinition => ({ label: { zh, en }, resources });
const phone = (number: string, zh: string, en: string, sourceUrl: string, kind: SupportResource["kind"] = "crisis", note?: LocalizedLabel): SupportResource => ({
  number, label: { zh, en }, href: `tel:${number.replace(/[^\d+]/g, "")}`, sourceUrl, kind, note,
});
const cnPsych = CN_PRIMARY_HOTLINES.find((line) => line.id === "psych")!;
const cnSupport = phone(cnPsych.number, cnPsych.zh, cnPsych.en, "https://www.nhc.gov.cn/yzygj/c100068/202412/49a1a65386cd4be582d4702fd0926ee8.shtml", "crisis", { zh: "服务时间以所在地为准", en: "Hours vary by locality" });

export const SUPPORT_REGIONS: Record<SupportRegion, SupportRegionDefinition> = {
  CN: {
    ...region("中国大陆", "Mainland China", [cnSupport, ...CN_PRIMARY_HOTLINES.filter((line) => line.id !== "psych").map((line) => ({
      kind: "emergency" as const, number: line.number, href: `tel:${line.tel}`, label: { zh: line.zh, en: line.en }, sourceUrl: "https://bjca.miit.gov.cn/zwgk/tzgg/art/2022/art_8d4eb93ee3424f30826c97ee400e8937.html",
    }))]),
    minorResources: [{ kind: "youth", number: CN_SUPPLEMENTAL.youth, href: `tel:${CN_SUPPLEMENTAL.youth}`, label: { zh: "青少年服务台", en: "Youth support" } }, cnSupport],
  },
  HK: region("中国香港", "Hong Kong", [
    phone("18111", "情绪通精神健康支持热线", "Mental Health Support Hotline", "https://www.shallwetalk.hk/en/get-help/mental-health-support-hotline-18111/", "crisis", { zh: "粤语、普通话、英语", en: "Cantonese, Mandarin and English" }),
    phone("999", "紧急服务", "Emergency services", "https://www.shallwetalk.hk/en/page/18111-mental-health-support-hotline-wa-terms/", "emergency"),
  ]),
  MO: region("中国澳门", "Macao", [
    { ...phone("2852 5222", "明爱生命热线", "Caritas Life Hope Hotline", "https://ssm.gov.mo/portal1/mentalhealth/EjrOViamw5dulZTkjA2AmA?lang=ch", "crisis", { zh: "中文服务", en: "Chinese-language service" }), href: "tel:+85328525222" },
    { ...phone("2852 5777", "明爱生命热线", "Caritas Life Hope Hotline", "https://ssm.gov.mo/portal1/mentalhealth/EjrOViamw5dulZTkjA2AmA?lang=ch", "crisis", { zh: "英语服务；请查看接听时段", en: "English-language service; check available hours" }), href: "tel:+85328525777" },
    phone("999", "紧急服务", "Emergency services", "https://ssm.gov.mo/portal1/mentalhealth/EjrOViamw5dulZTkjA2AmA?lang=ch", "emergency"),
  ]),
  TW: region("中国台湾", "Taiwan", [
    phone("1925", "安心专线", "Mental health support line", "https://dep.mohw.gov.tw/DOMHAOH/fp-4906-54077-107.html"),
    phone("119", "紧急医疗服务", "Emergency medical services", "https://www.nfa.gov.tw/cht/index.php?article_id=31&code=list&flag=detail&ids=21", "emergency"),
  ]),
  US: region("美国", "United States", [
    phone(INTL_RESOURCES.usCrisis, "自杀与危机生命线", "Suicide & Crisis Lifeline", "https://www.samhsa.gov/find-support/in-crisis"),
    phone(INTL_RESOURCES.usEmergency, "紧急服务", "Emergency services", "https://www.samhsa.gov/find-support/in-crisis", "emergency"),
  ]),
  CA: region("加拿大", "Canada", [
    phone("9-8-8", "自杀危机支持热线", "Suicide Crisis Helpline", "https://988.ca/", "crisis", { zh: "英语、法语；可电话或短信", en: "English and French; call or text" }),
    phone("911", "紧急服务", "Emergency services", "https://988.ca/", "emergency"),
  ]),
  UK: region("英国", "United Kingdom", [
    phone(INTL_RESOURCES.ukSamaritans, "Samaritans 倾听支持", "Samaritans support", "https://www.nhs.uk/every-mind-matters/urgent-support/"),
    phone("999", "紧急服务", "Emergency services", "https://www.nhs.uk/every-mind-matters/urgent-support/", "emergency"),
  ]),
  IE: region("爱尔兰", "Ireland", [
    phone(INTL_RESOURCES.ukSamaritans, "Samaritans 倾听支持", "Samaritans support", "https://www2.hse.ie/mental-health/services-support/get-urgent-help/"),
    phone("112", "紧急服务", "Emergency services", "https://www2.hse.ie/mental-health/services-support/get-urgent-help/", "emergency"),
  ]),
  AU: region("澳大利亚", "Australia", [
    phone(INTL_RESOURCES.auLifeline, "Lifeline 危机支持", "Lifeline crisis support", "https://www.health.gov.au/our-work/digital-mental-health-services"),
    phone("000", "紧急服务", "Emergency services", "https://www.health.gov.au/our-work/digital-mental-health-services", "emergency"),
  ]),
  NZ: region("新西兰", "New Zealand", [
    phone("1737", "简短情绪支持", "Brief emotional support", "https://www.1737.org.nz/", "crisis", { zh: "电话或短信；不能替代危机团队", en: "Call or text; does not replace a crisis team" }),
    phone("111", "紧急服务", "Emergency services", "https://www.1737.org.nz/", "emergency"),
  ]),
  SG: region("新加坡", "Singapore", [
    phone("1771", "national mindline 心理支持", "national mindline support", "https://www.moh.gov.sg/seeking-healthcare/find-a-facility-or-service/mental-health-services/"),
    phone("1767", "SOS 危机支持", "SOS crisis support", "https://www.sos.org.sg/contact-us/"),
    phone("995", "紧急医疗服务", "Emergency medical services", "https://www.scdf.gov.sg/home/about-scdf/emergency-medical-services", "emergency"),
  ]),
  JP: region("日本", "Japan", [
    { kind: "directory", label: { zh: "厚生劳动省心理支持目录", en: "Ministry of Health support directory" }, href: "https://www.mhlw.go.jp/mamorouyokokoro/", sourceUrl: "https://www.mhlw.go.jp/mamorouyokokoro/", note: { zh: "日语页面；各热线的语言和时段不同", en: "Japanese-language page; hours and languages vary by service" } },
    phone("119", "紧急医疗服务", "Emergency medical services", "https://www.fdma.go.jp/mission/enrichment/kyukyumusen_kinkyutuhou/119.html", "emergency"),
  ]),
  KR: region("韩国", "South Korea", [
    phone("109", "自杀预防咨询热线", "Suicide prevention helpline", "https://www.129.go.kr/109", "crisis", { zh: "官方说明为韩语；其他语言请先确认", en: "Official information is in Korean; check other language availability" }),
    phone("119", "紧急医疗服务", "Emergency medical services", "https://www.korea.net/K-InfoHub/SubMainDetail/view?articleId=4007&headwordCd=45&headwordGroupCd=21&pageIndex=1", "emergency"),
  ]),
  FR: region("法国", "France", [
    phone("3114", "自杀预防支持热线", "Suicide prevention helpline", "https://www.santepubliquefrance.fr/suicides-et-tentatives-de-suicide/notre-action"),
    phone("112", "紧急服务", "Emergency services", "https://www.service-public.gouv.fr/particuliers/vosdroits/F33954", "emergency"),
  ]),
  DE: region("德国", "Germany", [
    phone("0800 1110111", "TelefonSeelsorge 倾听支持", "TelefonSeelsorge support", "https://www.telefonseelsorge.de/telefon/", "crisis", { zh: "德语服务", en: "German-language service" }),
    phone("112", "紧急服务", "Emergency services", "https://gesund.bund.de/wege-im-gesundheitswesen/erwachsenenleben/notfaelle/notruf-und-notaufnahme", "emergency"),
  ]),
  OTHER: region("其他地区 / 尚未选择", "Other region / not selected"),
  UK_IE: region("英国 / 爱尔兰（旧设置）", "United Kingdom / Ireland (previous setting)", [
    phone(INTL_RESOURCES.ukSamaritans, "撒玛利亚会", "Samaritans", "https://www.samaritans.org/how-we-can-help/contact-samaritan/talk-us-phone/"),
    phone("999", "紧急服务", "Emergency services", "https://www.nhs.uk/every-mind-matters/urgent-support/", "emergency"),
  ]),
};

/** Lowercase `uk` was the old API's combined UK/Ireland value. */
export function parseSupportRegion(value: unknown): SupportRegion | null {
  if (typeof value !== "string") return null;
  if (value === "uk") return "UK_IE";
  const canonical = value.toUpperCase();
  return Object.hasOwn(SUPPORT_REGIONS, canonical) ? canonical as SupportRegion : null;
}
export function normalizeSupportRegion(value: unknown): SupportRegion {
  return parseSupportRegion(value) ?? "OTHER";
}
export function supportResources(value: unknown): SupportResource[] {
  return SUPPORT_REGIONS[normalizeSupportRegion(value)].resources;
}
export function minorSupportResources(value: unknown): SupportResource[] {
  const selected = SUPPORT_REGIONS[normalizeSupportRegion(value)];
  return selected.minorResources ?? selected.resources.filter((resource) => resource.kind !== "emergency");
}

export function formatSupportResourceList(resources: SupportResource[], language: "zh" | "en"): string {
  return resources.map((item) => `${item.label[language]}: ${item.number ?? item.href}${item.note ? ` (${item.note[language]})` : ""}`).join(" / ");
}
