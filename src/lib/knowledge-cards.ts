import type { KnowledgeCard } from "./types";

// Evidence-grounded knowledge base (2026-06-24 rebuild; 2026-06-25 web-research
// expansion to 17 cards). Every card cites ONE specific, long-standing authoritative
// source (WHO / NIMH / NHS / APA / CDC / NCCIH / PMC / PubMed) via a clickable
// `sourceUrl`, so any claim can be checked. `sourceQuote` is a VERBATIM excerpt; for
// the 2026-06-25 batch each quote was re-verified by exact-phrase, domain-restricted
// search against the live page. Cards whose verbatim could not be re-confirmed carry
// the URL + finding but no quote (e.g. affect-labeling) — never a fabricated "quote".
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
    sourceQuote: "A random effects meta-analysis of symptom level post treatment showed behavioural activation to be superior to controls (SMD −0.74 CI −0.91 to −0.56, k = 25, N = 1088) and medication (SMD −0.42 CI −0.83 to −0.00, k = 4, N = 283).",
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
    sourceQuote: "Cognitive behavioral therapy for insomnia (CBT-I) is a treatment with moderate to large effects.",
    clinicalStatus: "approved"
  },
  // ── 2026-06-25 web-research expansion ──────────────────────────────────────
  // Every card below was sourced by web research and its sourceQuote independently
  // re-verified (exact-phrase, domain-restricted search) against the live page.
  // affect-labeling carries URL + finding but no quote (verbatim not confirmable).
  {
    id: "panic-attacks",
    title: "惊恐发作:会到达顶峰,也会过去",
    tags: ["焦虑", "身体反应"],
    keywords: ["突然心跳很快", "喘不上气", "觉得自己要死了", "手抖出汗", "胸口很闷", "突然很害怕", "头晕站不稳", "感觉要失控了", "心慌得厉害"],
    content: "惊恐发作通常是一阵突然涌来的强烈恐惧,常伴随心跳加快、喘不上气、手抖、出汗、头晕等身体反应,让人感觉很可怕,甚至害怕自己失控或出事。重要的是:这种强烈的感受会达到一个顶峰,然后逐渐缓和、过去——它虽然吓人,但不会一直持续。世界卫生组织指出,惊恐障碍属于焦虑障碍,而焦虑障碍是有多种有效治疗方法的。你现在经历的,是很多人都经历过、并且能够好转的状况。",
    guidance: ["试着提醒自己:这股感觉正在到达顶点,接下来会慢慢退去;把注意力放在缓慢、拉长的呼气上。", "如果惊恐发作反复出现、影响到生活,寻求专业帮助是有效的一步。"],
    sourceTitle: "Anxiety disorders — World Health Organization",
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders",
    sourceQuote: "panic disorder (panic attacks and fear of continued panic attacks)",
    clinicalStatus: "approved"
  },
  {
    id: "social-anxiety",
    title: "社交焦虑:在人前感到强烈的不安",
    tags: ["焦虑", "社交"],
    keywords: ["怕和人说话", "害怕被别人评价", "不敢当众发言", "在人多的地方很紧张", "怕自己出丑", "聚会前很焦虑", "不敢看别人眼睛", "总觉得别人在看我", "社交后反复回想哪里做错了"],
    content: "社交焦虑不只是「害羞」,而是在社交或被人注视的场合里,产生强烈的恐惧和担忧——怕被人评判、觉得尴尬、被嫌弃或拒绝。这种担心可能让人回避聚会、发言或与陌生人交谈,事后还会反复回想自己「哪里做得不好」。世界卫生组织把社交焦虑障碍列为焦虑障碍的一种,并指出这类状况有多种有效的治疗方法,比如认知行为疗法。感到这样并不代表你「有问题」,很多人都在经历类似的感受。",
    guidance: ["可以从一个低压力的小互动开始练习,允许自己带着紧张去做,而不是非要等到「完全不紧张」。", "如果回避和担忧已经影响到工作、学习或人际关系,和专业人士聊聊会很有帮助。"],
    sourceTitle: "Anxiety disorders — World Health Organization",
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders",
    sourceQuote: "social anxiety disorder (high levels of fear and worry about social situations that might make the person feel humiliated, embarrassed or rejected)",
    clinicalStatus: "approved"
  },
  {
    id: "burnout-occupational",
    title: "职业倦怠:源自长期未被化解的工作压力",
    tags: ["压力", "工作"],
    keywords: ["上班好累", "对工作提不起劲", "每天都精疲力竭", "一想到上班就烦", "对工作越来越冷漠", "觉得自己做什么都没用", "工作没有成就感", "撑不下去了", "周一就开始累"],
    content: "世界卫生组织在国际疾病分类(ICD-11)中,把「职业倦怠(burn-out)」描述为一种由长期、未被成功管理的工作压力所导致的综合征。它有三个特征:精力耗竭或筋疲力尽的感觉;对工作产生心理上的疏离感,或对工作有负面、愤世嫉俗的情绪;以及职业效能感下降。世卫组织特别说明,倦怠专指工作情境中的现象,不用来描述生活其他领域的体验。换句话说,倦怠不是你「不够坚强」,而是长期压力累积的信号。",
    guidance: ["把它当作需要调整的信号,而不是个人失败——看看哪些负荷可以减少、暂停或求助。", "在工作之外,有意识地安排能真正让你恢复精力的休息与人际连接。"],
    sourceTitle: "Burn-out an occupational phenomenon: ICD-11 — World Health Organization",
    sourceUrl: "https://www.who.int/news/item/28-05-2019-burn-out-an-occupational-phenomenon-international-classification-of-diseases",
    sourceQuote: "Burn-out is a syndrome conceptualized as resulting from chronic workplace stress that has not been successfully managed.",
    clinicalStatus: "approved"
  },
  {
    id: "loneliness-health",
    title: "孤独对健康的影响:它是真实的,也很普遍",
    tags: ["孤独", "社会连接"],
    keywords: ["很孤独", "没有人懂我", "感觉被孤立", "没有人可以说话", "一个人很寂寞", "和谁都不亲近", "好像被全世界遗忘", "晚上特别孤单", "没有归属感"],
    content: "孤独不只是一种心情,它和身体健康真的有关。世界卫生组织社会连接委员会的报告指出,全球每 6 个人中就有 1 人正受到孤独的影响。报告还提到,孤独与社会隔离会增加中风、心脏病、糖尿病、认知衰退以及过早死亡的风险。这意味着:如果你感到孤独,你并不孤单——这是非常普遍的人类处境,而且重建社会连接被视为可以改善健康的方向。承认自己的孤独,本身就是迈向连接的第一步。",
    guidance: ["试着主动迈出一小步:给一个想念的人发条消息,或参与一次哪怕很短的面对面交流。", "如果孤独感长期压在心头、难以缓解,和信任的人或专业人士谈谈是值得的。"],
    sourceTitle: "Social connection linked to improved health — World Health Organization (2025)",
    sourceUrl: "https://www.who.int/news/item/30-06-2025-social-connection-linked-to-improved-heath-and-reduced-risk-of-early-death",
    sourceQuote: "loneliness and social isolation increase the risk of stroke, heart disease, diabetes, cognitive decline, and premature death.",
    clinicalStatus: "approved"
  },
  {
    id: "grief-bereavement",
    title: "哀伤与居丧:失去之后的自然反应",
    tags: ["哀伤", "丧失"],
    keywords: ["失去亲人", "走不出来", "好想念去世的人", "心里空了一块", "一直忍不住哭", "不知道怎么面对死亡", "悲伤到没力气", "感觉日子停住了", "他走了我该怎么办"],
    content: "哀伤(grief)是在经历重大丧失——通常是失去深爱的人之后,内心所承受的剧痛。这是一种自然的反应,没有「正确」或「错误」的哀伤方式。美国心理学会指出,如果有社会支持和健康的生活习惯,大多数人能随着时间慢慢从丧失中恢复;走出来可能需要几个月甚至一年,而且「没有所谓正常的哀伤时长」——每个人的节奏都不一样。同时,当哀伤特别沉重或迟迟无法缓解时,寻求专业人士的帮助也是完全合理的选择。",
    guidance: ["允许自己按自己的节奏哀伤,不必和别人比较,也不必急着「好起来」。", "和理解你的人聊聊;如果悲伤长期沉重、影响到日常生活,可以寻求擅长哀伤辅导的专业人士。"],
    sourceTitle: "Grief: Coping with the loss of your loved one — American Psychological Association",
    sourceUrl: "https://www.apa.org/topics/families/grief",
    sourceQuote: "It may take months or a year to come to terms with a loss. There is no \"normal\" time period for someone to grieve.",
    clinicalStatus: "approved"
  },
  {
    id: "chronic-stress-body",
    title: "长期压力对身体的影响",
    tags: ["压力", "身体健康"],
    keywords: ["压力太大", "一直很紧绷", "肩膀脖子很僵", "总是头痛", "心慌睡不好", "压力大到胸闷", "身体一直很累", "长期焦虑身体不舒服", "压力让我吃不下"],
    content: "长期处在压力中,身体会有真实的反应。美国心理学会指出,肌肉紧张几乎是身体对压力的一种反射性反应——是身体在防范受伤和疼痛,这也是为什么压力大时常感到肩颈僵硬、头痛。更重要的是,长期压力(在很长一段时间里持续存在的压力)可能给心脏和血管带来长期的问题。了解这些,不是为了让人更担心,而是提醒我们:身体的疲惫和不适,可能是压力在「说话」,值得被认真对待和照顾。",
    guidance: ["给身体一些主动放松的机会:伸展、慢走、深呼吸,哪怕每次只有几分钟。", "如果长期压力已经带来明显的身体不适,既值得就医检查身体,也值得寻求心理支持。"],
    sourceTitle: "Stress effects on the body — American Psychological Association",
    sourceUrl: "https://www.apa.org/topics/stress/body",
    sourceQuote: "Chronic stress, or a constant stress experienced over a prolonged period of time, can contribute to long-term problems for heart and blood vessels.",
    clinicalStatus: "approved"
  },
  {
    id: "sleep-hygiene-basics",
    title: "睡眠卫生:让身体更容易入睡的日常习惯",
    tags: ["失眠", "睡眠", "自我照顾"],
    keywords: ["睡不着怎么办", "晚上总醒", "改善睡眠", "几点睡比较好", "睡眠质量差", "躺床上睡不着", "怎么才能睡得好", "作息混乱", "熬夜睡不着"],
    content: "良好的睡眠习惯能帮助你睡得更好。美国疾控中心(CDC)给出的可操作建议包括:每天在固定时间上床和起床;保持卧室安静、放松、温度偏凉;睡前至少 30 分钟关闭电子设备;睡前避免大餐和酒精;下午和晚上避免摄入咖啡因;规律运动并保持健康饮食。CDC 还指出,18 至 60 岁的成年人每天需要 7 小时或更多睡眠。这些是面向大众的一般生活方式建议,不是针对个人的诊断或医疗方案。",
    guidance: ["可以先挑一条最容易做到的开始,例如把今晚的上床和起床时间固定下来。", "如果你长期睡眠困难、影响白天状态,建议找医生或专业人士聊聊。"],
    sourceTitle: "About Sleep — Centers for Disease Control and Prevention (CDC)",
    sourceUrl: "https://www.cdc.gov/sleep/about/index.html",
    sourceQuote: "Going to bed and getting up at the same time every day. Keeping your bedroom quiet, relaxing, and at a cool temperature.",
    clinicalStatus: "approved"
  },
  {
    id: "exercise-for-mental-health",
    title: "运动如何帮助情绪与心理健康",
    tags: ["运动", "情绪调节"],
    keywords: ["运动能改善情绪吗", "心情不好想动一动", "没动力运动", "焦虑怎么缓解", "情绪低落", "想让自己好受点", "运动减压", "动起来", "怎么提升心情"],
    content: "保持身体活动是对心理健康最有益的事情之一。英国 NHS 指出,活动起来时身体会释放让人感觉良好的激素,这些激素也能减轻焦虑和压力,并帮助睡得更好。NHS 列出的其他益处包括:提升自尊与自信,增强动力与专注,减少紧张、焦虑、压力和精神疲劳,并在面对愤怒、沮丧、悲伤等困难情绪时帮助平静下来。NHS 还提到,研究显示对一部分轻度抑郁的人来说,规律运动可能比抗抑郁药更有效。这是面向大众的健康信息,不替代个人的医疗判断。",
    guidance: ["不必一开始就剧烈运动,散步、伸展、瑜伽这类温和活动也算数。", "把它当成对自己好的一件小事,而不是必须完成的任务。"],
    sourceTitle: "Be active for your mental health — NHS (Every Mind Matters)",
    sourceUrl: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/be-active-for-your-mental-health/",
    sourceQuote: "Research shows that regular exercise might be a more effective treatment for some people with mild depression than antidepressants.",
    clinicalStatus: "approved"
  },
  {
    id: "mindfulness-anxiety-depression",
    title: "正念冥想对焦虑与抑郁的作用",
    tags: ["正念冥想", "情绪调节"],
    keywords: ["正念是什么", "冥想有用吗", "焦虑怎么平静", "脑子停不下来", "怎么放松", "情绪很乱", "正念能缓解抑郁吗", "想让自己静下来", "胡思乱想", "怎么活在当下"],
    content: "正念指的是把注意力或觉察停留在当下,而不做评判。关于它对心理健康的作用,美国国家补充与综合健康中心(NCCIH)总结道:基于正念的练习可能对焦虑和抑郁有帮助,它们比完全不干预要好,且效果可能与认知行为疗法等成熟的循证疗法相当。NCCIH 同时提醒,这类练习通常被认为风险很小,但少数人也会有不适体验。这是面向大众的科普,不构成诊断或治疗建议。",
    guidance: ["可以从每天几分钟、专注呼吸或身体感受开始,不必追求「清空大脑」。", "如果练习中出现明显不适,放慢节奏,必要时咨询专业人士。"],
    sourceTitle: "8 Things to Know About Meditation and Mindfulness — NCCIH (NIH)",
    sourceUrl: "https://www.nccih.nih.gov/health/tips/8-things-to-know-about-meditation-and-mindfulness",
    sourceQuote: "Mindfulness-based practices may be helpful for anxiety and depression. They are better than no treatment at all, and they may work as well as established evidence-based therapies",
    clinicalStatus: "approved"
  },
  {
    id: "affect-labeling-name-feelings",
    title: "把情绪「说出来」:情绪命名为何有帮助",
    tags: ["情绪调节", "自我照顾"],
    keywords: ["说不清自己的感受", "情绪上来怎么办", "写下来会好点吗", "给情绪命名", "心里堵得慌", "怎么表达情绪", "情绪压抑", "把感受写出来", "搞不懂自己的情绪"],
    content: "情绪命名(affect labeling)指的是为自己的感受命名和描述。心理学的行为与神经影像研究发现,仅仅把感受转化成语言,本身就可以作为一种情绪调节方式——它能降低情绪带来的神经反应,帮助减轻对不愉快刺激的负面反应。换句话说,试着用词语说出「我现在感到……」,本身可能就有舒缓作用。需要说明的是,这类效果会受时机和情绪强度等因素影响,并非对每个人、每种情境都同样有效。这是科普信息,不构成诊断或治疗方案。",
    guidance: ["下次情绪上来时,可以试着用一两个词说出或写下「我现在感到什么」。", "不用评判这个情绪对不对,先看见并命名它就好。"],
    sourceTitle: "Affect labeling: The role of timing and intensity (PMC review)",
    sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9799301/",
    clinicalStatus: "approved"
  },
  {
    id: "what-is-psychotherapy",
    title: "心理咨询是什么、什么时候可以求助",
    tags: ["心理咨询", "求助资源"],
    keywords: ["心理咨询是干什么的", "要不要看心理医生", "什么时候该求助", "找咨询师", "心理治疗有用吗", "情绪问题去哪看", "需要专业帮助吗", "心理咨询怎么找"],
    content: "美国国家心理卫生研究院(NIMH)解释:心理咨询(也称谈话治疗 talk therapy)指的是多种旨在帮助一个人识别并改变困扰自己的情绪、想法和行为的治疗方法,通常由持证的心理健康专业人员一对一或在小组中进行。NIMH 指出,人们出于很多原因寻求心理咨询,例如来自工作或家庭的严重或长期压力、失去亲人、人际或家庭问题,或出现没有身体原因可解释的睡眠/食欲改变、精力低下、对原本喜欢的事情失去兴趣等。这是面向大众的科普,寻求帮助是常见且正当的选择。",
    guidance: ["如果困扰持续影响你的日常、情绪或人际关系,寻求专业帮助是合理的一步。", "求助不代表你「不够坚强」,它更像是为自己找一个专业的支持。"],
    sourceTitle: "Psychotherapies — National Institute of Mental Health (NIMH)",
    sourceUrl: "https://www.nimh.nih.gov/health/topics/psychotherapies",
    sourceQuote: "Psychotherapy (also called talk therapy) refers to a variety of treatments that aim to help a person identify and change troubling emotions, thoughts, and behaviors.",
    clinicalStatus: "approved"
  },
  {
    id: "antidepressants-basic-facts",
    title: "关于抗抑郁药的基本事实(非用药建议)",
    tags: ["药物科普", "求助资源"],
    keywords: ["抗抑郁药是怎么起效的", "吃药多久有效果", "能自己停药吗", "抗抑郁药要吃多久", "感觉好了能停吗", "抗抑郁药安全吗", "要不要吃药", "抗抑郁药的常识"],
    content: "美国国家心理卫生研究院(NIMH)对抗抑郁药的一般介绍:抗抑郁药是用于治疗抑郁的药物,在某些情况下医生也可能用它来治疗焦虑、疼痛、失眠等。关于起效,NIMH 指出抗抑郁药通常需要数周时间才能见效,睡眠、食欲、精力和注意力等方面往往会先于情绪改善。一个非常重要的安全事实是:即使感觉好转,也不应在没有医疗专业人员帮助的情况下擅自停药——是否调整或减少剂量,需要由处方医生来决定。本卡片只提供一般性事实,不涉及具体药名或剂量,也不构成任何用药建议。",
    guidance: ["任何关于开始、调整或停止用药的决定,都请与你的处方医生商量。", "用药期间的疑问或不适,记录下来并带去和医生沟通会很有帮助。"],
    sourceTitle: "Mental Health Medications — National Institute of Mental Health (NIMH)",
    sourceUrl: "https://www.nimh.nih.gov/health/topics/mental-health-medications",
    sourceQuote: "People should not stop taking a prescribed medication, even if they are feeling better, without the help of a health care provider.",
    clinicalStatus: "approved"
  }
];

// Stable text used to build each card's embedding (npm run kb:embed). The runtime
// embeds the query with the SAME provider and cosine-ranks against these; if no
// embedding provider is configured it falls back to keyword retrieval (see knowledge.ts).
export function cardEmbedText(card: KnowledgeCard): string {
  return [card.title, card.content, card.keywords.join(" "), card.tags.join(" ")].join("\n");
}
