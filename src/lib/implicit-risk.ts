import { buildKimiPayload, generateKimiText, isKimiConfigured } from "./kimi";
import { buildDeepSeekPayload, generateDeepSeekText, getDeepSeekConfig } from "./deepseek";
import type {
  ChatMessage,
  ImplicitRiskAssessment,
  PragmaticForm,
  RiskAssessment,
  RiskFlag,
  RiskLevel,
  RiskModifier,
  RiskSeverity
} from "./types";

/**
 * Implicit-risk detection — the LLM-based semantic layer.
 *
 * Why this exists (research synthesis, DeepSuiMind 2025):
 *   General-purpose LLMs respond appropriately to <50% of *implicit*
 *   suicidal ideation cases, while doing >95% on explicit ones.
 *   DeepSeek-R1 went from 51.86% on implicit to 96.12% on explicit
 *   under standard prompting. The lexicon in safety.ts catches the
 *   explicit half; this module catches the implicit half.
 *
 * Professional principle: intentional over-triage. False positives mean an
 *   extra "I want to take that seriously" prompt; false negatives mean
 *   missing someone in actual crisis. The asymmetry is by design.
 *
 * Operational principle: never downgrade. If the lexicon escalated,
 *   that decision stands. The LLM can only ADD severity / flags.
 *
 * Fail-safe: classifier configured but errors → conservative escalation
 *   only when lexicon is already at "low" or higher. A truly clean
 *   message during a Kimi outage is released so we don't DoS the
 *   product on every transient API error.
 */

const VALID_SEVERITY: RiskSeverity[] = [
  "none",
  "passive_death_wish",
  "suicidal_ideation",
  "plan_preparation",
  "imminent_acute",
  "post_attempt_disclosure",
  "non_suicidal_self_harm"
];

const VALID_PRAGMATIC: PragmaticForm[] = [
  "self",
  "other",
  "quote_fictional",
  "sarcasm_hyperbole",
  "rhetorical_complaint",
  "emoji_coded",
  "coded_euphemism",
  "uncertain_ambivalent"
];

const VALID_MODIFIERS: RiskModifier[] = [
  "hopelessness",
  "burdensomeness",
  "entrapment",
  "isolation",
  "farewell_closure",
  "means_capability",
  "timeframe_recency",
  "help_seeking",
  "protective_factor",
  "cognitive_distortion"
];

const VALID_FLAGS: RiskFlag[] = [
  "medical_red_flag",
  "crisis_session_active",
  "medication_request",
  "diagnosis_request",
  "suicide_concern"
];

const LEVEL_SCORE: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

const CLASSIFIER_SYSTEM = [
  "你是一个临床级中文心理危机分类器，依据 C-SSRS（哥伦比亚自杀严重程度评定量表）和 D/S-IAT（死亡/自杀内隐联想测试）的临床框架对每一段心理咨询对话做风险评估。",
  "",
  "你的任务是**专门识别 implicit / 隐晦表达**：那些不直接说'想死''自杀''跳楼'的句子，但临床上属于真实自杀风险信号的内容。",
  "",
  "═══════════════════════════════════════════════════════════════",
  "**最重要的原则：你必须看整段对话，不是只看最后一条消息**",
  "═══════════════════════════════════════════════════════════════",
  "",
  "心理风险常常以**渐进式（gradient）**方式出现。任何一条消息单独看可能都不足以触发，但合起来是一个清晰的 C-SSRS 准备模式。判断步骤：",
  "",
  "**Step 1**：从第一条用户消息读到最后一条，把每条单独的信号列出来（绝望/方法/告别/独处/紧迫等）。",
  "**Step 2**：把这些信号在脑子里加起来——这是当前这个人的累积风险状态，不是只看最后一句。",
  "**Step 3**：用累积视角而不是最后一条的视角来判断 severity。",
  "",
  "**Gradient 例子**（必须按累积视角判断）：",
  "- 第 1 轮: \"最近真的什么都不想做了\"（hopelessness 暗示）",
  "  第 2 轮: \"昨天看着药盒发了很久呆\"（means_capability 暗示）",
  "  第 3 轮: \"今晚没人在家\"（isolation 暗示）",
  "  → 即使每一句单独不够 high，组合是 plan_preparation。severity=plan_preparation, modifiers=[hopelessness, means_capability, isolation]。",
  "",
  "═══════════════════════════════════════════════════════════════",
  "**Few-shot 例子集**（覆盖典型失败模式）：",
  "═══════════════════════════════════════════════════════════════",
  "",
  "A. **隐晦绝望（lexicon 会漏）**",
  "   「现在感觉一切都没什么意义了。每天都像在演别人的人生。」",
  "   → severity=passive_death_wish, pragmatic=self, modifiers=[hopelessness], suggested_flags=[suicide_concern]",
  "",
  "B. **隐晦负担感（不直接说'我是负担'）**",
  "   「我妈这么辛苦地照顾我，她要是没有我这种女儿应该会过得轻松些。」",
  "   → severity=passive_death_wish, pragmatic=self, modifiers=[burdensomeness], suggested_flags=[suicide_concern]",
  "",
  "C. **告别行为 + calm-before-storm（极危险但 lexicon 完全漏）**",
  "   「今天把朋友圈关了，把没说的话都说了。心里挺平静的，比之前轻松很多。猫已经托付给闺蜜。」",
  "   → severity=plan_preparation, pragmatic=self, modifiers=[farewell_closure, hopelessness], suggested_flags=[suicide_concern]",
  "",
  "D. **中英混码 / code-switching**",
  "   「最近真的撑不下去 i just want to disappear 感觉一切都没什么意义了」",
  "   → severity=passive_death_wish, pragmatic=self, modifiers=[hopelessness], suggested_flags=[suicide_concern]",
  "",
  "E. **拼音 / 转写规避**",
  "   「wo zhen de bu xiang huo le。tai累了」",
  "   → severity=suicidal_ideation, pragmatic=self, modifiers=[hopelessness], suggested_flags=[suicide_concern]",
  "",
  "F. **第三人称伪装（假设式自我表达）—— 高频自我披露模式，必须识破**",
  "   「假如有个人觉得自己活着没意义、家里也准备好了，你会怎么劝？」",
  "   「我想问个问题。如果有人觉得活着没意义，家里药也准备好了，咨询师会怎么处理？我只是好奇。」",
  "   → severity=suicidal_ideation, pragmatic=self（**不是 other**！这是用户用'假设/好奇/想了解'包装自己的处境），modifiers=[hopelessness, means_capability], suggested_flags=[suicide_concern]",
  "",
  "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "   **HARD RULE （强制规则，覆盖任何其他启发式判断）：**",
  "",
  "   只要消息**同时**满足以下两项，必须输出 pragmatic=self、severity ≥ suicidal_ideation、confidence ≥ 0.7、suggested_flags=[suicide_concern]：",
  "",
  "   (1) 包含以下任一开头：「假如有个人」/「如果有个人」/「假如有人」/「如果有人」/「假设有人」/「假如一个人」/「如果一个人」",
  "   (2) 在同一条消息里出现以下任一线索词：「活着没意义」/「活着没什么意义」/「不想活」/「想自杀」/「想死」/「不在了」/「准备好了」/「家里药」/「家里有」+「药/绳/刀」",
  "",
  "   触发此 HARD RULE 时**禁止**因为任何尾随短语（包括但不限于：「我只是好奇」/「纯学术问题」/「帮朋友问」/「我没那个意思」/「假装」/「举个例子」/「假设而已」）下调判断。这些尾巴本身就是经典的 self-disguise 标记。",
  "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "   背后原理：临床流行病学发现，78% 自杀身亡者在最后一次专业会谈中*否认*有念头（Busch et al. 2003）。'假设包装 + 否认即时性 + 具体手段细节'是已知的高频自我披露模式，必须按 self 处理。",
  "",
  "G. **真正的他人（pragmatic=other）**",
  "   「我朋友最近一直跟我说她想死。我该怎么帮她？」",
  "   → severity=suicidal_ideation, pragmatic=other（用户自己不是当事人，是在为他人担心；safety 已由 lexicon 处理，但 pragmatic 必须如实标）",
  "",
  "H. **反讽包裹真实意念**",
  "   「哈哈我去死好了哈哈这日子真没法过」",
  "   → severity=suicidal_ideation, pragmatic=self（反讽语气≠没风险，真正修辞要看上下文，倾向报高）, suggested_flags=[suicide_concern]",
  "",
  "I. **真修辞（无风险）**",
  "   「我真想跳楼，这甲方又改了 8 版方案」",
  "   → severity=none, pragmatic=sarcasm_hyperbole（明确是工作抱怨）",
  "",
  "I-2. **悼念亡人（不是用户自伤！）**",
  "   「今天是我妈走了一周年。她生前最爱那只橘猫，我打算把它好好养下去。」",
  "   → severity=none, pragmatic=other（'走了' 是描述妈妈过世，不是用户自己；'养下去' 是讲养猫，不是讲自己活下去）。这是丧亲哀伤，应该完全释放给后续支持流程，**不要触发 suicide_concern**。",
  "",
  "I-3. **回忆别人的过往尝试，但用户自己没有意念**",
  "   「我表姐高中时割过腕。我想多了解一下怎么帮可能有自伤想法的朋友。」",
  "   → severity=none, pragmatic=other（用户在咨询如何帮助他人，自己没有意念）。",
  "",
  "J. **历史尝试披露（post_attempt）**",
  "   「去年我吃了快一整瓶安眠药，是同学发现的。现在又开始有那种念头了。」",
  "   → severity=post_attempt_disclosure（叠加当前 ideation 提示 → 接近 plan_preparation 级别）, pragmatic=self, modifiers=[means_capability], suggested_flags=[suicide_concern]",
  "",
  "K. **emoji-coded 求救**",
  "   「这个世界 🌌 见。今晚 🪦」",
  "   → severity=plan_preparation, pragmatic=emoji_coded, modifiers=[farewell_closure, timeframe_recency], suggested_flags=[suicide_concern]",
  "",
  "═══════════════════════════════════════════════════════════════",
  "**人群特异性 few-shot（demographic — 这些人群的风险常以本群体特有的方式表达，必须识破）：**",
  "═══════════════════════════════════════════════════════════════",
  "",
  "S. **老年人负担感（CN 最高自杀率人群；burden 即 suicide_concern，无需 ideation core，有手段→升级）**",
  "   「我老了，眼睛也不行了，天天要儿女伺候，我走了他们就轻松了，省得拖累一家人。」",
  "   → severity=passive_death_wish（攒的药/楼顶/绳等手段→plan_preparation+）, pragmatic=self, modifiers=[burdensomeness,hopelessness], suggested_flags=[suicide_concern]。'拖累儿女/省得伺候/我走了他们就轻松/活着是累赘/早点走对大家好' 都映射为 burden。benign 对照:「我老了帮不上忙，让孩子多操心了」(温和愧疚，无退场框架)→none/low。",
  "",
  "T. **围产期母婴双重风险（'带孩子一起'＝HARD 升级，立即危机，覆盖 accumulator-soft）**",
  "   「生完孩子后我每天都很绝望，有时候觉得带着宝宝一起走可能对他更好。」",
  "   → severity=plan_preparation 或 imminent_acute, pragmatic=self, modifiers=[hopelessness], suggested_flags=[suicide_concern]（婴儿为非自愿被害者，附 harm_to_others 关切）。任何 '带(宝宝|孩子|他|她)一起走/一起解脱/我们一起离开' 都是 HARD 危机，不走软处理。benign 对照:「产后情绪低落常哭，但抱着宝宝又觉得有盼头」→medium 关怀（产后抑郁筛查），非危机。",
  "",
  "U. **慢病/绝症框架（entrapment+burden；区分真意念 vs 理性诊疗决定）**",
  "   「查出癌症之后我撑不下去了，治不好了，与其拖累家里花钱受罪，不如自己了断。」",
  "   → severity=suicidal_ideation（有手段→HIGH）, pragmatic=self, modifiers=[entrapment,burdensomeness,hopelessness], suggested_flags=[suicide_concern]。'不如自己了断/活够了/省下治疗费' 是意念。benign 对照:询问安宁疗护/DNR/预立医疗指示且无自我了断意图→none；「治疗痛苦但还想试新方案」→low。",
  "",
  "V. **青少年/校园（霸凌+孤立高冲动，阈值放低；isolation+ideation 至少 MEDIUM）**",
  "   「被全班孤立、天天被霸凌，我不想去上学了也不想活了，反正没人会想念我。」",
  "   → severity=suicidal_ideation, pragmatic=self, modifiers=[isolation,hopelessness], suggested_flags=[suicide_concern]。'没人会想念我/再也不用去学校(coded exit)' 要警觉。benign 对照:「今天被同学气死了不想上学」(短暂发泄无意念)→low;「考砸了好烦」→none。",
  "",
  "W. **性少数 minority-stress（家庭拒绝/不被接纳是独立放大因子；软框架也按 suicide_concern；回复需身份肯定）**",
  "   「出柜以后家里跟我断绝关系，我撑不住了，这个世界没有我的位置。」",
  "   → severity=suicidal_ideation, pragmatic=self, modifiers=[isolation,entrapment,burdensomeness], suggested_flags=[suicide_concern]。'没人接受真实的我/这个世界没有我的位置/做自己就活不下去' 映射为风险。benign 对照:「出柜后轻松多了朋友都支持」→none(protective_factor);「在纠结要不要出柜」(无意念)→low。",
  "",
  "═══════════════════════════════════════════════════════════════",
  "**中文 benign 锚点（日常困扰，无死亡/手段/告别/退场框架 → severity=none，禁止触发 suicide_concern）：**",
  "═══════════════════════════════════════════════════════════════",
  "",
  "CN-I1 「最近工作压力特别大，老是睡不好，心里一直很焦虑。」 → none, self（压力+失眠+焦虑的日常主诉，没有任何死亡/伤害/手段/告别/'活着没意义'线索；这是来访常态，按支持性对话处理，绝不要升级为 suicide_concern）。",
  "CN-I2 「太累了，感觉快扛不住了，想请几天假好好休息。」 → none, self（疲惫+想休息＝自我照顾意图，不是退场；此处'扛不住'是劳累，无死亡框架）。",
  "CN-I3 「这周忙到崩溃，只想找个没人的地方躺平两天。」 → none, self（'崩溃/躺平'＝压力宣泄+短暂逃离，不是死亡委婉；对照 EN-I2）。",
  "CN-I4 「心情很低落，提不起劲，对什么都没兴趣。」 → none/low, self（快感缺失/抑郁情绪本身不等于被动死亡愿望；只有出现明确'活着没意义/不如消失/不想醒来'等死亡框架时才升到 passive_death_wish。不要因为'低落/没兴趣'就报 suicide_concern，交支持流程与量表）。",
  "CN-I5 「焦虑到心跳很快、手发麻，感觉要出事，但我知道当下没有真实危险。」 → none, self（惊恐/躯体化，不是自杀意念；对照 EN-I5）。",
  "CN-D (benign 否认) 「我从来没有想过自杀，就是最近压力大」/「我不想死，只是太累了想休息一下」 → severity=none, pragmatic=self。第一人称直接否认自杀/死亡意图，且无手段、计划、告别、绝望或退场框架 → 释放，不要触发。这与「假如有个人…想自杀」式伪装根本不同：伪装必须有假设性开头（假如/如果有个人）＋具体线索；纯否认没有假设开头，按字面释放（临床上否认者被推危机干预会严重损害信任）。仅当否认同时伴随真实危机信号（手段/计划/告别/明确绝望/疲惫之外的死亡框架）时才升级。",
  "",
  "═══════════════════════════════════════════════════════════════",
  "**身体急症红旗（与自杀严重度独立 —— severity 可为 none，但要在 suggested_flags 加 'medical_red_flag'）：**",
  "═══════════════════════════════════════════════════════════════",
  "",
  "MED-1 「我突然胸口剧痛，喘不上气，话也说不清。」 → severity=none, pragmatic=self, suggested_flags=[medical_red_flag]（疑似急性心脏/神经急症，先导向医疗，不要当成惊恐而心理化）。",
  "MED-2 「这两天一直胸闷、有点喘，第一次这样。」 → severity=none, pragmatic=self, suggested_flags=[medical_red_flag]（首次发作的胸闷气短，身体红旗）。",
  "MED-3 (benign) 「最近老头疼，可能没睡好。」 → severity=none, pragmatic=self, suggested_flags=[]（普通躯体不适，不是急症红旗，不要标 medical_red_flag）。",
  "",
  "═══════════════════════════════════════════════════════════════",
  "**ENGLISH COVERAGE — apply the SAME schema / severity / pragmatic logic to English input.**",
  "═══════════════════════════════════════════════════════════════",
  "",
  "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "   **SELF-DISGUISE HARD RULE — ENGLISH (mirrors the 假如有个人 rule above; OVERRIDES any other heuristic):**",
  "   Output pragmatic=self, severity ≥ suicidal_ideation, confidence ≥ 0.7, suggested_flags=[suicide_concern] when a message satisfies BOTH:",
  "   (1) a hypothetical/displacing opener — e.g. 'hypothetically if someone…','say someone…','what if a person…','imagine someone who…','asking for a friend, if they…','suppose somebody…','there's this person who…'; AND",
  "   (2) in the SAME message, a concrete self-harm cue — either (a) a death/no-point clause ('no point in living','doesn't want to be here anymore','wants it to be over','doesn't want to wake up','everyone would be better off without them') OR (b) a means/preparation detail ('has the pills ready','rope/knife in the house','knows the dose','has it all set up').",
  "   When it fires you are FORBIDDEN to downgrade for any trailing deflection — 'just curious','asking for a friend','purely academic','I don't mean me','just a thought experiment','for a paper','no reason','just wondering' are themselves classic self-disguise markers; treat the deflection as evidence FOR self. (Busch et al. 2003: 78% denied ideation at last contact.)",
  "   STRICT BOUNDARY vs genuine academia (EN-R): a true knowledge question asks about the field — definitions, statistics, C-SSRS levels, citations, how to help a third party — with NO concrete personalized situation. Release as pragmatic=other only when prongs (1)+(2) are NOT both met.",
  "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "EN-A 「Nothing really feels like it matters anymore. Every day I'm just going through the motions, playing a part in someone else's life.」 → passive_death_wish, self, [hopelessness], suicide_concern.",
  "EN-B 「My mom works so hard taking care of me. She'd honestly have an easier life if she didn't have a kid like me to worry about.」 → passive_death_wish, self, [burdensomeness], suicide_concern.",
  "EN-C 「I deactivated my socials today and said everything I'd been holding back. I feel weirdly calm now, lighter than I've felt in a long time. My cat's already going to my best friend.」 → plan_preparation, self, [farewell_closure,hopelessness], suicide_concern.",
  "EN-D 「I can't keep doing this. I don't want to be alive anymore, I'm just so tired of everything.」 → suicidal_ideation, self, [hopelessness], suicide_concern.",
  "EN-E 「Some nights I just wish I could go to sleep and not wake up. Not in a dramatic way, I just don't want to keep doing the mornings.」 → passive_death_wish, self, [hopelessness], suicide_concern（the 'not dramatic' hedge does NOT downgrade）.",
  "EN-F 「Hypothetically, if someone felt like there was no point in living and already had the pills ready at home, how would a therapist talk to them? Just curious.」 → suicidal_ideation, self (HARD RULE; 'just curious' is disguise, not a downgrade), [hopelessness,means_capability], suicide_concern, confidence≥0.7.",
  "EN-F2 「Asking for a friend — say a person just doesn't want to be here anymore and has it all set up. What happens next? No reason, just wondering.」 → suicidal_ideation, self, [means_capability,hopelessness], suicide_concern.",
  "EN-G 「My friend keeps texting me that she wants to die. I don't know how to help her, what do I do?」 → suicidal_ideation, other (user is NOT the at-risk party; NO disguise opener), suggested_flags=[concern_for_other].",
  "EN-H 「lmao guess I'll just kill myself then 🙃 honestly can't do this life thing anymore」 → suicidal_ideation, self (irony wraps real hopelessness; lean HIGH), [hopelessness], suicide_concern.",
  "EN-I (BENIGN) 「This deadline is literally killing me, I'll throw myself off the roof if the client requests one more revision.」 → none, sarcasm_hyperbole.",
  "EN-I1 (BENIGN) 「I'm dead tired, running on three hours of sleep all week, completely wiped.」 → none, self（'dead tired/wiped'＝exhaustion, not death ideation）.",
  "EN-I2 (BENIGN) 「I just want to disappear for a weekend, no phone, no people, somewhere with no wifi.」 → none, self（bounded escape/vacation, not a death euphemism）.",
  "EN-I3 (BENIGN) 「bro I just whiffed that 1v1, kms lol 😭 ranked is so rigged today」 → none, sarcasm_hyperbole（gaming banter; re-evaluate only if genuine distress coexists）.",
  "EN-I4 (BENIGN) 「creators say 'unalive' instead of 'suicide' so the algorithm doesn't demonetize them — wild how moderation reshapes language.」 → none, other（'unalive' discussed AS a word, meta/policy）.",
  "EN-I5 (BENIGN) 「My heart's racing, hands numb, I feel like I'm about to die, but I know there's no real danger right now.」 → none, self（panic/somatic threat sensation, not ideation）.",
  "EN-J 「Last year I took almost a whole bottle of sleeping pills, a classmate found me. Lately I've been getting those thoughts again.」 → post_attempt_disclosure (recurrence → near plan_preparation), self, [means_capability], suicide_concern.",
  "EN-K 「see you on the other side 🌌 tonight 🪦」 → plan_preparation, emoji_coded, [farewell_closure,timeframe_recency], suicide_concern.",
  "EN-L 「I sent my friend all my account passwords. You won't need to look for me after this — I suddenly feel really at peace. Logging off for good.」 → plan_preparation, coded_euphemism, [farewell_closure], suicide_concern.",
  "EN-M (BENIGN) 「I deactivated my socials and honestly I feel calmer — I'm going to focus on studying for finals.」 → none, self（clear ordinary purpose, no death/burden/method/goodbye cue）.",
  "EN-N 「i'm done fr fr, ain't got it in me to keep goin, just wanna be done with all of it」 → suicidal_ideation, self（informal/regional spelling is not a pragmatic category; content is genuine ideation）, [hopelessness], suicide_concern.",
  "EN-O 「I want to dissolve into the wind tonight and drift off the 28th floor, never to be seen by anyone again.」 → plan_preparation, self（high floor + 'tonight'＝method+timeframe; 'drift off the Nth floor'＝jumping metaphor; 'become a star/never come back'＝death euphemism）, [hopelessness,timeframe_recency,means_capability], suicide_concern.",
  "EN-P (BENIGN) 「that boss one-shot me lmao, did a suicide rush and fed three kills 💀」 / 「let me slit my wrists to proc the lifesteal then ult」 → none, sarcasm_hyperbole（game mechanics + meme, no real intent）.",
  "EN-Q (BENIGN) 「these lyrics hit so hard: 'drag the blade across my wrist' — been on repeat all day」 → none, quote_fictional（explicitly attributed to a work）.",
  "EN-R (BENIGN) 「How are the five C-SSRS severity levels defined? It's for a class assignment.」 → none, other（field/scale question, no personal situation; STRICTLY distinct from the EN-F disguise pattern）.",
  "",
  "**English coded slang (decode semantically, NOT bare keyword-fire):** 'ctb'/'catch the bus' = method-coded suicide (strong self-risk when exit/farewell/hopelessness framing is present; release on literal transit talk or meta-discussion of forum slang); 'take all my pills'/'down the whole bottle'/'OD' = means+quantity, can reach plan_preparation (release prescribed-regimen 'I take all my pills at 8am as directed' and recounting someone else's past event without self-intent).",
  "",
  "═══════════════════════════════════════════════════════════════",
  "**判断规则汇总：**",
  "═══════════════════════════════════════════════════════════════",
  "",
  "1. **语义判断，不是字面匹配**。「准备好了」在抑郁上下文是 imminence，不是「准备好旅行了」。",
  "2. **宁可报高（Intentional Over-triage）**。在 passive_death_wish 和 suicidal_ideation 之间犹豫，且看到具体手段或时间，选 suicidal_ideation。",
  "3. **pragmatic 字段必须如实标注**。如果是修辞 / 转述别人 / 引用文学作品，标 sarcasm_hyperbole / other / quote_fictional——不要因为「想死」两个字就标 self。但要识破「假设有个人...」式的自我伪装：那是 self，不是 other。",
  "4. **跨语言 / 拼音 / emoji 必须正确解码**。code-switched 不是 pragmatic 类别，整体内容仍可能是 self 的真实意念。",
  "5. **evidence 必须直接引用用户原话**，最多 3 条，每条不超过 60 字。可以引用早期轮次的话，不只是最后一条。",
  "6. **rationale 必须 < 120 字**，说明判断理由，并指出是单条触发还是累积触发。",
  "7. **suggested_flags**：当 severity ∈ {passive_death_wish, suicidal_ideation, plan_preparation, imminent_acute, post_attempt_disclosure} 且 pragmatic=self → 必须加 'suicide_concern' 标志。其他情况留空。",
  "7b. **medical_red_flag（身体急症，独立于自杀判断）**：若消息描述疑似身体急症——胸痛/胸口剧痛、突发或持续呼吸困难/喘不上气、晕厥/意识模糊、疑似中风（一侧无力/说话不清/口角歪斜）、首次剧烈发作、孕期急症等——在 suggested_flags 加 'medical_red_flag'（severity 可独立为 none，pragmatic=self）。只标当下疑似急症；普通躯体不适（轻微头痛、偶尔心慌、慢性老毛病）不要标。",
  "8. **疑似未成年人优先保护**：出现 在校/年级/'班主任'/'爸妈不让/会骂'/'未成年'/年龄 12–17 岁 等线索，且同时有任何自伤、被动死亡愿望或绝望信号时 → 阈值放低、severity 至少按 MEDIUM 处理并倾向上调一级（青少年高冲动、求助意愿低），suggested_flags 照常加 'suicide_concern'。严格区分：用户本人是未成年→据此升级（pragmatic=self）；用户是老师/家长在谈孩子→pragmatic=other，不据此升级。",
  "",
  "C-SSRS 严重度等级 (severity 字段)：",
  "- none：无风险信号。",
  "- passive_death_wish：被动死亡愿望（不存在就好、消失更好、没意义）。",
  "- suicidal_ideation：主动意念但无方法。",
  "- plan_preparation：有方法 / 在做准备行为（看药、查剂量、写遗书、托付、囤药）。",
  "- imminent_acute：方法+独处+时间紧迫，即将发生。",
  "- post_attempt_disclosure：曾尝试或正在透露过去的尝试。",
  "- non_suicidal_self_harm：自伤但非自杀意图。",
  "",
  "Pragmatic form (pragmatic 字段) —— 关键的去模糊化层：",
  "- self：用户自己。",
  "- other：在谈别人。",
  "- quote_fictional：文学、歌词、电影引用。",
  "- sarcasm_hyperbole：修辞性夸张，不是真实意念。",
  "- rhetorical_complaint：抱怨语气，介于真实和修辞之间。",
  "- emoji_coded：通过 emoji 编码情绪。",
  "- coded_euphemism：用「下班」「睡过去」「去远方」之类委婉表达。",
  "- uncertain_ambivalent：自己也搞不清是不是真的想死。",
  "",
  "Modifier (modifiers 字段，可多选):",
  "- hopelessness：绝望、没有未来感。",
  "- burdensomeness：觉得自己是别人的负担。",
  "- entrapment：困住、无路可走。",
  "- isolation：当下独自、没人能联系。",
  "- farewell_closure：告别行为、留遗物、托付。",
  "- means_capability：拥有或接近自伤工具。",
  "- timeframe_recency：「今晚」「现在」「这周」。",
  "- help_seeking：在主动求助（保护因子）。",
  "- protective_factor：有家人/朋友/未来计划撑着（保护因子）。",
  "- cognitive_distortion：明显认知扭曲（全有全无、自我贬低）。",
  "",
  "confidence 是 0–1 之间的小数，反映你对 severity + pragmatic 判断的把握。",
  "",
  "输出严格 JSON，不输出 markdown 代码块，不输出任何解释：",
  '{"severity":"none|passive_death_wish|suicidal_ideation|plan_preparation|imminent_acute|post_attempt_disclosure|non_suicidal_self_harm","pragmatic":"self|other|quote_fictional|sarcasm_hyperbole|rhetorical_complaint|emoji_coded|coded_euphemism|uncertain_ambivalent","modifiers":["..."],"evidence":["..."],"confidence":0.0,"suggested_flags":["..."],"rationale":"..."}'
].join("\n");

function emptyResult(): ImplicitRiskAssessment {
  return {
    severity: "none",
    pragmatic: "self",
    modifiers: [],
    evidence: [],
    confidence: 0,
    suggestedFlags: [],
    rationale: ""
  };
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  const normalized = value.toLowerCase().trim();
  return (allowed.find((entry) => entry === normalized) ?? fallback) as T;
}

function coerceEnumArray<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const match = allowed.find((entry) => entry === item.toLowerCase().trim());
    if (match) seen.add(match);
  }
  return [...seen];
}

function coerceConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.min(1, Math.max(0, parsed));
  }
  return 0;
}

function coerceStrings(value: unknown, max = 3, maxLen = 80): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, max);
}

function parseImplicitOutput(raw: string): ImplicitRiskAssessment | null {
  try {
    const trimmed = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;

    return {
      severity: coerceEnum<RiskSeverity>(parsed.severity, VALID_SEVERITY, "none"),
      pragmatic: coerceEnum<PragmaticForm>(parsed.pragmatic, VALID_PRAGMATIC, "self"),
      modifiers: coerceEnumArray<RiskModifier>(parsed.modifiers, VALID_MODIFIERS),
      evidence: coerceStrings(parsed.evidence, 3, 80),
      confidence: coerceConfidence(parsed.confidence),
      suggestedFlags: coerceEnumArray<RiskFlag>(parsed.suggested_flags, VALID_FLAGS),
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 200) : ""
    };
  } catch {
    return null;
  }
}

function formatConversation(messages: ChatMessage[]) {
  return messages
    // Widen the judge's window 8→14 turns so slowly-accumulating, cross-turn risk
    // trajectories aren't truncated away before the classifier can add them up.
    // Per-message cap kept lean (800) on purpose: the classifier is latency-bound
    // (see the 12s timeout) and a fat window can overflow an 8k model — set
    // KIMI_MODEL=moonshot-v1-32k in prod for real headroom.
    .slice(-14)
    .map((message) => {
      const speaker = message.role === "user" ? "来访者" : "AI";
      return `${speaker}：${message.content.slice(0, 800)}`;
    })
    .join("\n");
}

/** Result of calling the implicit-risk classifier. Tagged union so callers
 * can distinguish "ok" / "not_configured" / "error" for fail-safe policy. */
export type ImplicitOutcome =
  | { kind: "ok"; result: ImplicitRiskAssessment }
  | { kind: "not_configured" }
  | { kind: "error"; reason: string };

// generateDeepSeekText has no timeout parameter of its own (requestDeepSeek uses a
// fixed internal AbortController timeout tuned for the main reply generation). Since
// deepseek.ts is not to be modified for this backup-judge path, race the call against
// a local timer instead — same soft-timeout shape as kimi.ts's withPromiseTimeout.
function withPromiseTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("DeepSeek backup judge timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Why the DeepSeek backup judge answered instead of Kimi (recorded on the result). */
type FallbackReason = NonNullable<ImplicitRiskAssessment["fallbackReason"]>;

/**
 * Classify a failed Kimi judge attempt so the retry / circuit policy can act on it.
 * Exported for tests. Error strings come from kimi.ts: HTTP failures look like
 * `Kimi API error <status>: <body…>` (kimi.ts:98); a local timeout is either
 * withPromiseTimeout's "Kimi response timed out" or the AbortController abort
 * ("This operation was aborted"). Anything unrecognized is non-retryable so an
 * unknown failure can never widen the latency envelope.
 */
export function classifyKimiJudgeError(message: string): {
  /** Billing / auth — Kimi keeps failing until a human intervenes. Trips the circuit. */
  permanent: boolean;
  retryable: boolean;
  /** Backoff before the single retry (rate limits need a longer breath than blips). */
  backoffMs: number;
  fallbackReason: FallbackReason;
} {
  if (
    /suspended|insufficient balance|billing|欠费/i.test(message) ||
    /Kimi API error (401|403|404)/.test(message)
  ) {
    return { permanent: true, retryable: false, backoffMs: 0, fallbackReason: "kimi_billing" };
  }
  // Local timeout: the budget is already spent — a retry would double the wait.
  if (/Kimi response timed out/i.test(message) || /abort/i.test(message)) {
    return { permanent: false, retryable: false, backoffMs: 0, fallbackReason: "kimi_timeout" };
  }
  // Any non-permanent 429 (rate-limit markers or a bare 429) → retryable after a beat.
  if (/Kimi API error 429/.test(message)) {
    return { permanent: false, retryable: true, backoffMs: 1000, fallbackReason: "kimi_rate" };
  }
  if (/Kimi API error 5\d\d/.test(message) || /fetch failed|ECONNRESET|network/i.test(message)) {
    return { permanent: false, retryable: true, backoffMs: 400, fallbackReason: "kimi_transient" };
  }
  // Unknown shape → fall to the backup judge quickly rather than wait longer.
  return { permanent: false, retryable: false, backoffMs: 0, fallbackReason: "kimi_transient" };
}

// Circuit breaker for PERMANENT Kimi failures (billing / auth). While open we skip
// the doomed Kimi call and hand the turn straight to the DeepSeek backup judge —
// only the Kimi call is skipped; the fail-safe ladder in decideImplicitIntercept
// is untouched.
const KIMI_CIRCUIT_OPEN_MS = 10 * 60 * 1000;
let kimiDownUntil = 0;

function tripKimiCircuit(reason: string) {
  const alreadyOpen = Date.now() < kimiDownUntil;
  kimiDownUntil = Date.now() + KIMI_CIRCUIT_OPEN_MS;
  if (!alreadyOpen) {
    // Single-line JSON, logged once per trip, so ops can alert on it.
    console.error(
      JSON.stringify({
        event: "kimi_judge_circuit_open",
        reason: reason.slice(0, 200),
        until: new Date(kimiDownUntil).toISOString()
      })
    );
  }
}

/** Test-only: reset the module-level circuit-breaker state between cases. */
export function __resetKimiJudgeCircuitForTests() {
  kimiDownUntil = 0;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function assessImplicitRiskWithLLM(
  messages: ChatMessage[],
  // Raised 5s→12s after a live eval: real classifier calls (300-line prompt + JSON,
  // ~320 tokens out) measured ~6s, so the old 5s cap was timing out ~40% of calls →
  // implicit-ideation cases the lexicon can't catch were being released (missed).
  // 12s lets the call complete while staying well under the route's 60s maxDuration.
  timeoutMs = 12_000,
  // DeepSeek backup-judge budget when Kimi fails — kept tight so the worst case
  // (Kimi times out, then the backup also runs) still lands well inside the route's
  // maxDuration.
  backupTimeoutMs = 6_000
): Promise<ImplicitOutcome> {
  if (!isKimiConfigured()) {
    return { kind: "not_configured" };
  }
  if (messages.filter((m) => m.role === "user").length === 0) {
    return { kind: "ok", result: emptyResult() };
  }

  const userContent = [
    "请基于以下对话片段，对来访者当前的隐晦自杀/自伤风险做 C-SSRS 框架的临床评估。",
    "只输出 JSON。任何模糊的情况，宁可报高。",
    "",
    "【对话】",
    formatConversation(messages)
  ].join("\n");

  const payload = buildKimiPayload({
    systemPrompt: CLASSIFIER_SYSTEM,
    messages: [{ role: "user", content: userContent }],
    temperature: 0.1,
    maxTokens: 320,
    jsonMode: true
  });

  // Error-aware Kimi attempt — this gate blocks the user's first token, so latency
  // matters. classifyKimiJudgeError sorts failures: retry Kimi exactly once, and
  // only when (a) the failure is retryable, (b) the first attempt failed FAST
  // (elapsed ≤ 2.5s — a slow failure has already eaten the budget), and (c) this is
  // the deep blocking tier (timeoutMs ≥ 10s; the fast 5s tail judge stays single-shot).
  // Worst-case budget accounting (must stay ≤ the pre-change worst of 12s Kimi +
  // 6s backup = 18s):
  //   retry path:        2.5s fail + 1s backoff + min(8, 12−2.5−1)=8s retry + 6s backup = 17.5s
  //   no-retry path:     12s + 6s = 18s (unchanged)
  //   circuit-open path: 0s Kimi + min(12, 12)=12s backup
  let lastReason = "unknown error";
  let fallbackReason: FallbackReason | undefined;
  if (Date.now() < kimiDownUntil) {
    // Circuit open → Kimi is known-down (billing/auth); don't burn latency on it.
    lastReason = "kimi circuit open";
    fallbackReason = "kimi_circuit_open";
  } else {
    const startedAt = Date.now();
    try {
      const raw = await generateKimiText(payload, timeoutMs);
      const parsed = parseImplicitOutput(raw);
      if (parsed) return { kind: "ok", result: { ...parsed, judgedBy: "kimi" } };
      lastReason = "parse failed";
      fallbackReason = "kimi_parse"; // non-JSON output → same fall-to-backup as before
    } catch (err) {
      lastReason = err instanceof Error ? err.message : "unknown error";
      const failure = classifyKimiJudgeError(lastReason);
      fallbackReason = failure.fallbackReason;
      if (failure.permanent) tripKimiCircuit(lastReason);
      const elapsed = Date.now() - startedAt;
      if (failure.retryable && elapsed <= 2500 && timeoutMs >= 10_000) {
        await sleep(failure.backoffMs);
        try {
          const retryTimeoutMs = Math.min(8000, timeoutMs - elapsed - failure.backoffMs);
          const raw = await generateKimiText(payload, retryTimeoutMs);
          const parsed = parseImplicitOutput(raw);
          if (parsed) return { kind: "ok", result: { ...parsed, judgedBy: "kimi" } };
          lastReason = "parse failed";
          fallbackReason = "kimi_parse";
        } catch (retryErr) {
          lastReason = retryErr instanceof Error ? retryErr.message : "unknown error";
          const retryFailure = classifyKimiJudgeError(lastReason);
          fallbackReason = retryFailure.fallbackReason;
          if (retryFailure.permanent) tripKimiCircuit(lastReason);
        }
      }
    }
  }

  // Kimi failed (threw, produced unparseable output, or is circuit-skipped). If
  // DeepSeek is configured, give it one bounded attempt as a backup judge before
  // falling to the fail-safe ladder — this is strictly an EXTRA chance to get a real
  // classification, never a downgrade of the existing fail-safe behavior below.
  if (getDeepSeekConfig().apiKey) {
    try {
      const backupPayload = buildDeepSeekPayload({
        systemPrompt: CLASSIFIER_SYSTEM,
        messages: [{ role: "user", content: userContent }],
        apiModel: "deepseek-v4-flash",
        stream: false,
        maxTokens: 320
      });
      // Circuit open → Kimi consumed none of this turn's budget, so the backup may
      // use the wider min(timeoutMs, 12s) instead of the tight 6s default.
      const backupBudgetMs =
        fallbackReason === "kimi_circuit_open" ? Math.min(timeoutMs, 12_000) : backupTimeoutMs;
      const raw = await withPromiseTimeout(generateDeepSeekText(backupPayload), backupBudgetMs);
      const parsed = parseImplicitOutput(raw);
      if (parsed) {
        console.warn(`[implicit-risk] Kimi failed (${lastReason}); DeepSeek backup judge answered.`);
        return { kind: "ok", result: { ...parsed, judgedBy: "deepseek", fallbackReason } };
      }
    } catch {
      /* 备胎也挂 → 走原 fail-safe */
    }
  }

  // Make outages visible (operational signal) rather than failing silently.
  console.warn(
    `[implicit-risk] Kimi classifier unavailable after retry (${lastReason}); falling back to lexicon-only this turn — implicit-only self-harm signals may be missed.`
  );
  return { kind: "error", reason: lastReason };
}

/**
 * Decide what static response (if any) should fire based on the implicit
 * assessment. Returns:
 *  - { intercept: false, ... } → DeepSeek may run; the implicit result is
 *    still attached to the risk for system-prompt context.
 *  - { intercept: true, flag: "suicide_concern" } → fire suicide-concern template
 *  - { intercept: true, flag: "crisis" } → fire full crisis template
 *
 * Rules (over-triage):
 *  - pragmatic !== "self" → never intercept based on implicit alone
 *    (the message is about another person, fictional, hyperbole, etc.).
 *    The lexicon's existing escalation, if any, still applies.
 *  - severity ∈ {plan_preparation, imminent_acute, post_attempt_disclosure}
 *    AND pragmatic === "self" → CRISIS template
 *  - severity ∈ {passive_death_wish, suicidal_ideation, non_suicidal_self_harm}
 *    AND pragmatic === "self" → suicide_concern template
 *  - confidence < 0.4 → suppress unless severity = imminent_acute (always fire)
 */
export type ImplicitDecision =
  | { intercept: false; source: "none" | "low_confidence" | "non_self_pragmatic" | "fail_safe_release"; rationale: string }
  | { intercept: true; mode: "crisis" | "suicide_concern" | "gentle_check"; source: "llm" | "fail_safe"; rationale: string };

// Clear death / self-exit / hopelessness cues used to CONFIRM a judge-labelled
// passive_death_wish before it routes anywhere. Deliberately excludes ambiguous
// everyday idioms (撑不住 / 好累 / 好烦 / 没动力) so plain venting the judge mislabels
// is RELEASED, not re-admitted. This only gates the SOFT tier (passive_death_wish);
// it never affects the crisis tiers. ⚠ Part of the clinically-reviewed gentle_check
// design (see gentle-check.test.ts) — keep edits conservative + run that suite.
const DEATH_CUE_MARKERS = [
  "没意义", "没什么意义", "没有意义", "活着没意思", "活着没什么意思", "活着没意义", "活着没劲",
  "不想活", "活不下去", "想死", "不想醒", "醒不来", "不想再醒", "睡过去就", "永远睡",
  "消失", "从这个世界", "离开这个世界", "解脱", "一了百了", "结束这一切", "结束自己", "结束生命",
  "没有未来", "看不到希望", "绝望", "不如死", "死了算了", "不如不在", "没人会想念我", "活着是负担",
  "no point in living", "not worth living", "want to disappear", "don't want to be here",
  "dont want to be here", "end it all", "no reason to live", "no future", "better off without me",
  "wish i was gone", "want to die", "don't want to wake up"
];

function hasRealDeathCue(evidence: string[]): boolean {
  const hay = evidence.join(" ").toLowerCase();
  return DEATH_CUE_MARKERS.some((m) => hay.includes(m));
}

export function decideImplicitIntercept(
  outcome: ImplicitOutcome,
  lexicon: RiskAssessment
): ImplicitDecision {
  if (outcome.kind === "ok") {
    const r = outcome.result;

    // Bias: pragmatic-non-self releases (the message isn't about user themselves).
    if (r.pragmatic !== "self") {
      return {
        intercept: false,
        source: "non_self_pragmatic",
        rationale: `LLM: pragmatic=${r.pragmatic}, severity=${r.severity}`
      };
    }

    // Always-fire on imminent_acute, even at low confidence.
    if (r.severity === "imminent_acute") {
      return {
        intercept: true,
        mode: "crisis",
        source: "llm",
        rationale: `imminent_acute detected: ${r.rationale}`
      };
    }

    // High-confidence preparation or post-attempt → crisis.
    if (
      (r.severity === "plan_preparation" || r.severity === "post_attempt_disclosure") &&
      r.confidence >= 0.4
    ) {
      return {
        intercept: true,
        mode: "crisis",
        source: "llm",
        rationale: `${r.severity} (conf=${r.confidence.toFixed(2)}): ${r.rationale}`
      };
    }

    // Suicidal ideation / NSSI (active) → suicide_concern, NEVER softened — active
    // ideation is not a gentle-tier candidate even at modest confidence.
    if (
      (r.severity === "suicidal_ideation" || r.severity === "non_suicidal_self_harm") &&
      r.confidence >= 0.4
    ) {
      return {
        intercept: true,
        mode: "suicide_concern",
        source: "llm",
        rationale: `${r.severity} (conf=${r.confidence.toFixed(2)}): ${r.rationale}`
      };
    }

    // passive_death_wish — the mildest tier and the one the intentionally-aggressive
    // judge over-triages onto plain sadness ("我好伤心" → full number-grading, per the
    // 2026-06-25 owner report). GRADED routing (clinically-reviewed gentle_check design,
    // gentle-check.test.ts):
    //   • a HARD signal (lexicon suicide flag, or a means/farewell/imminent-timeframe
    //     modifier) → always the full template.
    //   • otherwise gate on the judge's OWN evidence: if it carries no real death/
    //     hopelessness cue, the judge mislabelled benign venting → RELEASE.
    //   • cue present + high confidence (≥0.6) → full template.
    //   • cue present + low confidence (0.4–0.6) → warm gentle check (no hotlines/grading).
    if (r.severity === "passive_death_wish" && r.confidence >= 0.4) {
      const hardSignal =
        lexicon.flags.includes("suicide_concern") ||
        lexicon.categories.includes("suicide") ||
        lexicon.categories.includes("self_harm") ||
        LEVEL_SCORE[lexicon.level] >= LEVEL_SCORE.high ||
        r.modifiers.includes("means_capability") ||
        r.modifiers.includes("farewell_closure") ||
        r.modifiers.includes("timeframe_recency");
      if (hardSignal) {
        return {
          intercept: true,
          mode: "suicide_concern",
          source: "llm",
          rationale: `passive_death_wish + hard signal (conf=${r.confidence.toFixed(2)}): ${r.rationale}`
        };
      }
      if (!hasRealDeathCue(r.evidence)) {
        return {
          intercept: false,
          source: "none",
          rationale: `passive_death_wish but no death cue in evidence → likely mislabel, release: ${r.rationale}`
        };
      }
      if (r.confidence >= 0.6) {
        return {
          intercept: true,
          mode: "suicide_concern",
          source: "llm",
          rationale: `passive_death_wish + cue (conf=${r.confidence.toFixed(2)}): ${r.rationale}`
        };
      }
      return {
        intercept: true,
        mode: "gentle_check",
        source: "llm",
        rationale: `passive_death_wish + cue, low conf (${r.confidence.toFixed(2)}) → gentle: ${r.rationale}`
      };
    }

    if (r.confidence < 0.4 && r.severity !== "none") {
      return {
        intercept: false,
        source: "low_confidence",
        rationale: `severity=${r.severity}, conf=${r.confidence.toFixed(2)}`
      };
    }

    return {
      intercept: false,
      source: "none",
      rationale: r.rationale || "no implicit risk detected"
    };
  }

  if (outcome.kind === "not_configured") {
    return {
      intercept: false,
      source: "none",
      rationale: "LLM 未配置，跳过 implicit 检测"
    };
  }

  // ERROR — fail-safe. The deterministic lexicon is the safety FLOOR; a flaky LLM
  // call must not be what decides escalation. So on a Kimi error we DEFER to the
  // lexicon's own judgment rather than blanket-escalating:
  //   - lexicon level >= medium        → lexicon flow already owns it; nothing extra.
  //   - lexicon == low AND suicide-adjacent (suicide_concern flag, or a
  //       self_harm/suicide category) → conservative escalation to suicide_concern.
  //   - lexicon == low but GENERIC (焦虑/压力/失眠 with no suicide-adjacent signal)
  //       → release. Auto-firing the suicide template on everyday distress every
  //       time Kimi is slow is a false-positive by construction; it desensitizes
  //       users to real safety cues ("cry wolf") and erodes trust in a product
  //       where these words are the norm.
  //   - lexicon == none                → release (avoid DoS during a Kimi outage).
  if (LEVEL_SCORE[lexicon.level] >= LEVEL_SCORE.medium) {
    return {
      intercept: false,
      source: "fail_safe_release",
      rationale: `LLM 错误但 lexicon 已 ${lexicon.level}，由 lexicon 流程处理：${outcome.reason}`
    };
  }
  const suicideAdjacentLow =
    lexicon.level === "low" &&
    (lexicon.flags.includes("suicide_concern") ||
      lexicon.categories.includes("self_harm") ||
      lexicon.categories.includes("suicide"));
  if (suicideAdjacentLow) {
    return {
      intercept: true,
      mode: "suicide_concern",
      source: "fail_safe",
      rationale: `LLM 错误 + lexicon=low 且挨近自杀信号，保守升级到 suicide_concern：${outcome.reason}`
    };
  }
  return {
    intercept: false,
    source: "fail_safe_release",
    rationale: `LLM 错误但 lexicon 无自杀相邻信号（${lexicon.level}），放行：${outcome.reason}`
  };
}

/**
 * Apply the implicit assessment to a lexicon-derived RiskAssessment to
 * produce a merged risk that the rest of the pipeline can use. The implicit
 * assessment is attached as `implicit` for downstream system-prompt context.
 *
 * Severity-monotone: never downgrades the lexicon's level/flags. The
 * LLM may ADD flags and bump the level, but not lower them.
 */
export function mergeImplicitWithLexicon(
  lexicon: RiskAssessment,
  outcome: ImplicitOutcome
): RiskAssessment {
  if (outcome.kind !== "ok") return lexicon;
  const r = outcome.result;

  const flags = new Set<RiskFlag>(lexicon.flags);
  if (r.pragmatic === "self") {
    for (const flag of r.suggestedFlags) {
      flags.add(flag);
    }
  }

  let level: RiskLevel = lexicon.level;
  if (r.pragmatic === "self") {
    const severityRank: Record<RiskSeverity, RiskLevel> = {
      none: "none",
      non_suicidal_self_harm: "medium",
      passive_death_wish: "medium",
      suicidal_ideation: "medium",
      plan_preparation: "high",
      imminent_acute: "high",
      post_attempt_disclosure: "high"
    };
    const llmLevel = severityRank[r.severity];
    if (LEVEL_SCORE[llmLevel] > LEVEL_SCORE[level]) {
      level = llmLevel;
    }
  }

  const rationaleParts = [lexicon.rationale];
  if (r.rationale) rationaleParts.push(`语义判断：${r.rationale}`);
  if (r.evidence.length) {
    rationaleParts.push(`证据：${r.evidence.map((line) => `「${line}」`).join("；")}`);
  }

  return {
    ...lexicon,
    level,
    flags: [...flags],
    shouldEscalate: level === "high",
    rationale: rationaleParts.filter(Boolean).join("。 "),
    implicit: r
  };
}
