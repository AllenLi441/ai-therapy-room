import { CN_PRIMARY_HOTLINES, CN_SUPPLEMENTAL, INTL_RESOURCES } from "./crisis-resources";
import { localized, type AppLanguage } from "./languages";

/** Shared by the browser, record backups, request validation and safety prompts. */
export const SUPPORT_REGION_CODES = ["CN", "HK", "MO", "TW", "US", "CA", "UK", "IE", "AU", "NZ", "SG", "JP", "KR", "FR", "DE", "OTHER"] as const;
export type SelectableSupportRegion = typeof SUPPORT_REGION_CODES[number];
// Keep the old combined selection until the user explicitly chooses a country.
export type SupportRegion = SelectableSupportRegion | "UK_IE";
export type SupportRegionInput = SupportRegion | Lowercase<SupportRegion>;
export type LocalizedLabel = { zh: string; en: string } & Partial<Record<AppLanguage, string>>;
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

// Region names and generic service labels in every interface language. Country-local
// services also get their own-language label; anything missing falls back to zh / en.
const REGION_NAMES: Record<SupportRegion, Partial<Record<AppLanguage, string>>> = {
  CN: { "zh-Hant": "中國大陸", ja: "中国本土", ko: "중국 본토", es: "China continental", fr: "Chine continentale", de: "Festlandchina" },
  HK: { "zh-Hant": "中國香港", ja: "香港", ko: "홍콩", es: "Hong Kong", fr: "Hong Kong", de: "Hongkong" },
  MO: { "zh-Hant": "中國澳門", ja: "マカオ", ko: "마카오", es: "Macao", fr: "Macao", de: "Macau" },
  TW: { "zh-Hant": "中國台灣", ja: "台湾", ko: "대만", es: "Taiwán", fr: "Taïwan", de: "Taiwan" },
  US: { "zh-Hant": "美國", ja: "アメリカ", ko: "미국", es: "Estados Unidos", fr: "États-Unis", de: "USA" },
  CA: { "zh-Hant": "加拿大", ja: "カナダ", ko: "캐나다", es: "Canadá", fr: "Canada", de: "Kanada" },
  UK: { "zh-Hant": "英國", ja: "イギリス", ko: "영국", es: "Reino Unido", fr: "Royaume-Uni", de: "Vereinigtes Königreich" },
  IE: { "zh-Hant": "愛爾蘭", ja: "アイルランド", ko: "아일랜드", es: "Irlanda", fr: "Irlande", de: "Irland" },
  AU: { "zh-Hant": "澳洲", ja: "オーストラリア", ko: "호주", es: "Australia", fr: "Australie", de: "Australien" },
  NZ: { "zh-Hant": "紐西蘭", ja: "ニュージーランド", ko: "뉴질랜드", es: "Nueva Zelanda", fr: "Nouvelle-Zélande", de: "Neuseeland" },
  SG: { "zh-Hant": "新加坡", ja: "シンガポール", ko: "싱가포르", es: "Singapur", fr: "Singapour", de: "Singapur" },
  JP: { "zh-Hant": "日本", ja: "日本", ko: "일본", es: "Japón", fr: "Japon", de: "Japan" },
  KR: { "zh-Hant": "韓國", ja: "韓国", ko: "대한민국", es: "Corea del Sur", fr: "Corée du Sud", de: "Südkorea" },
  FR: { "zh-Hant": "法國", ja: "フランス", ko: "프랑스", es: "Francia", fr: "France", de: "Frankreich" },
  DE: { "zh-Hant": "德國", ja: "ドイツ", ko: "독일", es: "Alemania", fr: "Allemagne", de: "Deutschland" },
  OTHER: { "zh-Hant": "其他地區 / 尚未選擇", ja: "その他の地域 / 未選択", ko: "기타 지역 / 선택 안 함", es: "Otra región / sin seleccionar", fr: "Autre région / non choisie", de: "Andere Region / nicht gewählt" },
  UK_IE: { "zh-Hant": "英國 / 愛爾蘭（舊設定）", ja: "イギリス / アイルランド（以前の設定）", ko: "영국 / 아일랜드 (이전 설정)", es: "Reino Unido / Irlanda (ajuste anterior)", fr: "Royaume-Uni / Irlande (ancien réglage)", de: "Vereinigtes Königreich / Irland (frühere Einstellung)" },
};
// Keyed by the English label (or note) already used above.
const LABEL_TRANSLATIONS: Record<string, Partial<Record<AppLanguage, string>>> = {
  "Find local support": { "zh-Hant": "查找當地支援", ja: "地域の相談窓口を探す", ko: "지역 지원 찾기", es: "Buscar ayuda local", fr: "Trouver une aide locale", de: "Hilfe vor Ort finden" },
  "Emergency services": { "zh-Hant": "緊急服務", ja: "緊急通報", ko: "긴급 신고", es: "Servicios de emergencia", fr: "Services d’urgence", de: "Notruf" },
  "Emergency medical services": { "zh-Hant": "緊急醫療服務", ja: "救急", ko: "응급 의료 서비스", es: "Emergencias médicas", fr: "Urgences médicales", de: "Rettungsdienst" },
  "Emergency medical": { "zh-Hant": "急救", ja: "救急", ko: "응급 의료", es: "Emergencias médicas", fr: "Urgences médicales", de: "Rettungsdienst" },
  "Police": { "zh-Hant": "公安報警", ja: "警察", ko: "경찰", es: "Policía", fr: "Police", de: "Polizei" },
  "Psychological support line": { "zh-Hant": "全國心理援助熱線", ja: "心の相談ダイヤル", ko: "심리 지원 상담전화", es: "Línea de apoyo psicológico", fr: "Ligne de soutien psychologique", de: "Psychologische Hilfe-Hotline" },
  "Youth support": { "zh-Hant": "青少年服務台", ja: "青少年相談窓口", ko: "청소년 상담", es: "Apoyo para jóvenes", fr: "Soutien aux jeunes", de: "Hilfe für Jugendliche" },
  "Hours vary by locality": { "zh-Hant": "服務時間以所在地為準", ja: "受付時間は地域によって異なります", ko: "운영 시간은 지역마다 달라요", es: "El horario varía según la zona", fr: "Les horaires varient selon les lieux", de: "Die Zeiten sind je nach Ort verschieden" },
  "Mental Health Support Hotline": { "zh-Hant": "情緒通精神健康支援熱線", ja: "メンタルヘルス支援ホットライン", ko: "정신건강 지원 핫라인", es: "Línea de apoyo en salud mental", fr: "Ligne de soutien en santé mentale", de: "Hotline für psychische Gesundheit" },
  "Cantonese, Mandarin and English": { "zh-Hant": "粵語、普通話、英語", ja: "広東語・中国語（普通話）・英語", ko: "광둥어, 중국어(보통화), 영어", es: "Cantonés, mandarín e inglés", fr: "Cantonais, mandarin et anglais", de: "Kantonesisch, Mandarin und Englisch" },
  "Caritas Life Hope Hotline": { "zh-Hant": "明愛生命熱線", ja: "カリタス生命ホットライン", ko: "카리타스 생명 희망 핫라인", es: "Línea Caritas Life Hope", fr: "Ligne Caritas Life Hope", de: "Caritas Life-Hope-Hotline" },
  "Chinese-language service": { "zh-Hant": "中文服務", ja: "中国語での対応", ko: "중국어 서비스", es: "Servicio en chino", fr: "Service en chinois", de: "Chinesischsprachiges Angebot" },
  "English-language service; check available hours": { "zh-Hant": "英語服務；請查看接聽時段", ja: "英語での対応。受付時間を確認してください", ko: "영어 서비스; 운영 시간을 확인하세요", es: "Servicio en inglés; consulta el horario", fr: "Service en anglais ; vérifie les horaires", de: "Englischsprachiges Angebot; bitte Zeiten prüfen" },
  "Mental health support line": { "zh-Hant": "安心專線", ja: "心の相談専用ダイヤル", ko: "마음 안심 상담전화", es: "Línea de apoyo en salud mental", fr: "Ligne de soutien en santé mentale", de: "Hotline für psychische Gesundheit" },
  "Suicide & Crisis Lifeline": { "zh-Hant": "自殺與危機生命線", ja: "自殺・危機ライフライン", ko: "자살 및 위기 상담전화", es: "Línea de Prevención del Suicidio y Crisis", fr: "Ligne de prévention du suicide et de crise", de: "Suizid- und Krisen-Hotline" },
  "Suicide Crisis Helpline": { "zh-Hant": "自殺危機支援熱線", ja: "自殺危機ヘルプライン", ko: "자살 위기 상담전화", es: "Línea de ayuda en crisis suicida", fr: "Ligne d’aide en cas de crise suicidaire", de: "Hotline bei Suizidkrisen" },
  "English and French; call or text": { "zh-Hant": "英語、法語；可電話或簡訊", ja: "英語・フランス語。電話またはSMS", ko: "영어, 프랑스어; 전화 또는 문자", es: "Inglés y francés; llamada o mensaje de texto", fr: "Anglais et français ; appel ou texto", de: "Englisch und Französisch; Anruf oder SMS" },
  "Samaritans support": { "zh-Hant": "Samaritans 傾聽支援", ja: "サマリタンズ（傾聴）", ko: "사마리탄즈 상담", es: "Samaritans (escucha)", fr: "Samaritans (écoute)", de: "Samaritans (Zuhören)" },
  "Lifeline crisis support": { "zh-Hant": "Lifeline 危機支援", ja: "ライフライン危機支援", ko: "라이프라인 위기 지원", es: "Lifeline: apoyo en crisis", fr: "Lifeline : soutien de crise", de: "Lifeline-Krisenhilfe" },
  "Brief emotional support": { "zh-Hant": "簡短情緒支援", ja: "気持ちの相談（短時間）", ko: "짧은 정서 지원", es: "Apoyo emocional breve", fr: "Soutien émotionnel bref", de: "Kurze emotionale Unterstützung" },
  "Call or text; does not replace a crisis team": { "zh-Hant": "電話或簡訊；不能取代危機團隊", ja: "電話またはSMS。危機対応チームの代わりにはなりません", ko: "전화 또는 문자; 위기 대응팀을 대신하지 않아요", es: "Llamada o mensaje; no sustituye a un equipo de crisis", fr: "Appel ou texto ; ne remplace pas une équipe de crise", de: "Anruf oder SMS; ersetzt kein Kriseninterventionsteam" },
  "national mindline support": { "zh-Hant": "national mindline 心理支援", ja: "national mindline（心の相談）", ko: "national mindline 심리 지원", es: "Apoyo de national mindline", fr: "Soutien national mindline", de: "national mindline – Unterstützung" },
  "SOS crisis support": { "zh-Hant": "SOS 危機支援", ja: "SOS危機支援", ko: "SOS 위기 지원", es: "SOS: apoyo en crisis", fr: "SOS : soutien de crise", de: "SOS-Krisenhilfe" },
  "Ministry of Health support directory": { "zh-Hant": "厚生勞動省心理支援目錄", ja: "厚生労働省「まもろうよ こころ」相談窓口一覧", ko: "일본 후생노동성 상담 창구 안내", es: "Directorio de apoyo del Ministerio de Salud", fr: "Répertoire d’aide du ministère de la Santé", de: "Hilfeverzeichnis des Gesundheitsministeriums" },
  "Japanese-language page; hours and languages vary by service": { "zh-Hant": "日語頁面；各熱線的語言和時段不同", ja: "日本語のページ。窓口ごとに対応言語と時間が異なります", ko: "일본어 페이지; 기관마다 언어와 시간이 달라요", es: "Página en japonés; horarios e idiomas varían según el servicio", fr: "Page en japonais ; horaires et langues selon le service", de: "Japanischsprachige Seite; Zeiten und Sprachen je nach Angebot" },
  "Suicide prevention helpline": { "zh-Hant": "自殺防治諮詢專線", ja: "自殺予防相談ダイヤル", ko: "자살예방 상담전화", es: "Línea de prevención del suicidio", fr: "Ligne de prévention du suicide", de: "Hotline zur Suizidprävention" },
  "Official information is in Korean; check other language availability": { "zh-Hant": "官方說明為韓語；其他語言請先確認", ja: "公式案内は韓国語です。他の言語は事前に確認してください", ko: "공식 안내는 한국어로 되어 있어요", es: "La información oficial está en coreano; consulta otros idiomas", fr: "Informations officielles en coréen ; vérifie les autres langues", de: "Offizielle Informationen auf Koreanisch; andere Sprachen vorab prüfen" },
  "TelefonSeelsorge support": { "zh-Hant": "TelefonSeelsorge 傾聽支援", ja: "TelefonSeelsorge（電話相談）", ko: "TelefonSeelsorge 전화 상담", es: "TelefonSeelsorge (escucha)", fr: "TelefonSeelsorge (écoute)", de: "TelefonSeelsorge" },
  "German-language service": { "zh-Hant": "德語服務", ja: "ドイツ語での対応", ko: "독일어 서비스", es: "Servicio en alemán", fr: "Service en allemand", de: "Deutschsprachiges Angebot" },
  "Samaritans": { "zh-Hant": "撒瑪利亞會", ja: "サマリタンズ", ko: "사마리탄즈", es: "Samaritans", fr: "Samaritans", de: "Samaritans" },
};
for (const [code, definition] of Object.entries(SUPPORT_REGIONS) as Array<[SupportRegion, SupportRegionDefinition]>) {
  Object.assign(definition.label, REGION_NAMES[code]);
  for (const resource of [...definition.resources, ...(definition.minorResources ?? [])]) {
    Object.assign(resource.label, LABEL_TRANSLATIONS[resource.label.en]);
    if (resource.note) Object.assign(resource.note, LABEL_TRANSLATIONS[resource.note.en]);
  }
}

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

export function formatSupportResourceList(resources: SupportResource[], language: AppLanguage): string {
  return resources.map((item) => `${localized(language, item.label)}: ${item.number ?? item.href}${item.note ? ` (${localized(language, item.note)})` : ""}`).join(" / ");
}
