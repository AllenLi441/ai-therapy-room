import type { KnowledgeCard } from "./types";

// Evidence-grounded knowledge base (2026-06-24 rebuild). Every card cites ONE
// specific, long-standing authoritative research source via a clickable `sourceUrl`,
// so any claim can be checked. `sourceQuote` is a VERBATIM excerpt that was actually
// fetched from that page; cards whose figures come from a research index (PubMed/PMC
// search) instead of a direct fetch carry the URL + finding but no fake "quote".
//
// This deliberately replaces the earlier 75 AI-paraphrased cards, which only had
// domain-level labels and were not independently verifiable. Quality + checkability
// over quantity. NON-diagnostic; crisis/suicide is NEVER handled here — it stays on
// the deterministic safety floor. clinicalStatus "approved" = retrievable.
export const KNOWLEDGE_CARDS: KnowledgeCard[] = [
  {
    id: "who-depression",
    title: "抑郁:临床事实与一线方法（WHO）",
    tags: ["抑郁", "情绪"],
    keywords: ["抑郁", "抑郁症", "情绪低落", "提不起劲", "没意思", "没兴趣", "高兴不起来", "消沉", "空虚", "兴趣减退", "什么都不想"],
    content: "抑郁是常见心理障碍,核心是持续两周以上的情绪低落,或对原本喜欢的事失去兴趣,常伴注意力下降、自我价值感低、睡眠和食欲改变、疲惫。全球约 3.32 亿人受影响,女性约为男性的 1.5 倍。它是可治疗的,心理治疗(如认知行为疗法)是一线方法。",
    guidance: ["不下诊断;先承接情绪,再温和让对方知道'持续两周以上的低落+失去兴趣,值得被认真对待,而且能被帮助'。", "WHO 给普通人的建议:尽量继续做以前喜欢的事、与亲友保持联系、向专业人员求助。"],
    sourceTitle: "WHO — Depressive disorder (depression) 实况报道",
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/depression",
    sourceQuote: "try to keep doing activities you used to enjoy",
    clinicalStatus: "approved"
  },
  {
    id: "nimh-anxiety",
    title: "焦虑障碍:与日常紧张的区别（NIMH）",
    tags: ["焦虑", "情绪"],
    keywords: ["焦虑", "紧张", "担心", "心慌", "坐立不安", "总担心", "停不下来", "害怕", "不安", "焦虑症"],
    content: "焦虑障碍包括广泛性焦虑、惊恐障碍、社交焦虑和各类恐惧症。美国约三分之一的青少年和成人,一生中会经历某种焦虑障碍。和日常紧张不同的是:它的焦虑不会自行消退、出现在很多情境里、而且可能随时间加重。它高度可治疗,认知行为疗法与暴露是循证一线方法。",
    guidance: ["不下诊断;一边正常化'焦虑很常见',一边留意'不消退 / 泛化到很多情境 / 越来越重'这三个区别于普通紧张的信号。"],
    sourceTitle: "NIMH — Anxiety Disorders（美国国立精神卫生研究院）",
    sourceUrl: "https://www.nimh.nih.gov/health/topics/anxiety-disorders",
    sourceQuote: "For people with these disorders, anxiety does not go away, is felt in many situations, and can get worse over time.",
    clinicalStatus: "approved"
  },
  {
    id: "icbt-efficacy",
    title: "认知行为疗法到底有没有用（元分析,带效应量）",
    tags: ["治疗", "CBT", "循证"],
    keywords: ["有用吗", "管用吗", "有效吗", "能好吗", "会不会好", "怎么治", "治疗", "心理咨询有用", "认知行为", "CBT", "看心理医生"],
    content: "一项纳入 19 项常规照护研究、共 12,096 人的系统综述与元分析显示:基于互联网的认知行为疗法(iCBT)对抑郁的治疗前后效应量 g=1.18(95%CI 1.06–1.29)、对焦虑 g=0.94(0.83–1.06),均属'大效应'。也就是说,CBT 这类方法对抑郁和焦虑有临床上有意义的改善,不是安慰剂。",
    guidance: ["当对方怀疑'这真的有用吗',可以用'研究里 CBT 这类方法对抑郁焦虑的效果挺扎实'给一点现实的希望,但不夸大、不打包票、不替代正规治疗。"],
    sourceTitle: "PMC — iCBT in Routine Care: Systematic Review & Meta-Analysis（n=12,096）",
    sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7490682/",
    sourceQuote: "The average pre-post effect size of all depression treatments was g=1.18 (95% CI 1.06-1.29), which can be considered a large effect.",
    clinicalStatus: "approved"
  },
  {
    id: "behavioral-activation",
    title: "行为激活:对「什么都不想做」的循证解法（元分析）",
    tags: ["治疗", "抑郁", "循证"],
    keywords: ["不想动", "什么都不想做", "动不起来", "没动力", "提不起劲", "宅", "躺平", "拖着", "做不了事", "行为激活"],
    content: "行为激活——逐步、从极小处恢复有意义或愉悦的活动——是抑郁的循证疗法。一项纳入 26 项随机对照试验、1,524 人的元分析显示,行为激活优于对照组(标准化均数差 SMD≈−0.74),效果与抗抑郁药相当。它正对'越不动越糟、越糟越不想动'的恶性循环。",
    guidance: ["关键不是'你要积极一点',而是'先做、再有感觉',从一个低到几乎没负担的小动作起步,而不是等有动力才动。"],
    sourceTitle: "PMC — Behavioural Activation for Depression: Meta-Analysis Update（26 RCTs）",
    sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4061095/",
    clinicalStatus: "approved"
  },
  {
    id: "cbti-insomnia",
    title: "失眠的循证一线疗法是 CBT-I,不是数羊（元分析）",
    tags: ["失眠", "睡眠", "循证"],
    keywords: ["失眠", "睡不着", "睡不好", "半夜醒", "早醒", "入睡难", "睡眠", "熬夜", "凌晨还醒", "睡眠质量"],
    content: "失眠的循证一线疗法是失眠认知行为疗法(CBT-I)——调整睡眠作息、限制卧床、处理对睡眠的焦虑想法——而不是单纯的睡眠卫生口诀或安眠药。元分析显示它对原发与共病失眠都有中到大的效果,并能在 3、6、12 个月随访时维持。",
    guidance: ["别只甩'早点睡 / 别熬夜';如果失眠持续,温和指出 CBT-I 这种有研究支持的方法存在,引导找专业资源,而不是停在道理上。"],
    sourceTitle: "PubMed — CBT for Insomnia: Meta-Analysis of Long-Term Effects",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/31491656/",
    clinicalStatus: "approved"
  }
];

// Stable text for an optional future vector path; current retrieval is keyword-based.
export function cardEmbedText(card: KnowledgeCard): string {
  return [card.title, card.content, card.keywords.join(" "), card.tags.join(" ")].join("\n");
}
