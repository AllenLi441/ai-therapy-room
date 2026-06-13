import { buildKimiPayload, generateKimiText, isKimiConfigured } from "./kimi";
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
 * Clinical principle: intentional over-triage. False positives mean an
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
    .slice(-8)
    .map((message) => {
      const speaker = message.role === "user" ? "来访者" : "AI";
      return `${speaker}：${message.content.slice(0, 600)}`;
    })
    .join("\n");
}

/** Result of calling the implicit-risk classifier. Tagged union so callers
 * can distinguish "ok" / "not_configured" / "error" for fail-safe policy. */
export type ImplicitOutcome =
  | { kind: "ok"; result: ImplicitRiskAssessment }
  | { kind: "not_configured" }
  | { kind: "error"; reason: string };

export async function assessImplicitRiskWithLLM(
  messages: ChatMessage[],
  timeoutMs = 5_000
): Promise<ImplicitOutcome> {
  if (!isKimiConfigured()) {
    return { kind: "not_configured" };
  }
  if (messages.filter((m) => m.role === "user").length === 0) {
    return { kind: "ok", result: emptyResult() };
  }

  const payload = buildKimiPayload({
    systemPrompt: CLASSIFIER_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          "请基于以下对话片段，对来访者当前的隐晦自杀/自伤风险做 C-SSRS 框架的临床评估。",
          "只输出 JSON。任何模糊的情况，宁可报高。",
          "",
          "【对话】",
          formatConversation(messages)
        ].join("\n")
      }
    ],
    temperature: 0.1,
    maxTokens: 320,
    jsonMode: true
  });

  // Single bounded attempt — this gate blocks the user's first token, so latency
  // matters. On any failure we drop to the fail-safe ladder (lexicon-none → release,
  // lexicon-low → conservative suicide_concern). (Previously retried once, which
  // doubled worst-case wait before the reply started.)
  let lastReason = "unknown error";
  {
    try {
      const raw = await generateKimiText(payload, timeoutMs);
      const parsed = parseImplicitOutput(raw);
      if (parsed) return { kind: "ok", result: parsed };
      lastReason = "parse failed";
    } catch (err) {
      lastReason = err instanceof Error ? err.message : "unknown error";
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

    // Passive death wish / suicidal ideation / NSSI → suicide_concern (medium).
    if (
      (r.severity === "passive_death_wish" ||
        r.severity === "suicidal_ideation" ||
        r.severity === "non_suicidal_self_harm") &&
      r.confidence >= 0.4
    ) {
      return {
        intercept: true,
        mode: "suicide_concern",
        source: "llm",
        rationale: `${r.severity} (conf=${r.confidence.toFixed(2)}): ${r.rationale}`
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
