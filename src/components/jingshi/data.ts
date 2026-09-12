/* data.ts — companion, i18n, scales, risk detection (from design handoff).
   The mock streamReply is intentionally dropped — app.tsx streams the real
   /api/chat. Persona id stays "linxi" for backend-contract compatibility;
   display name is 安屿 / Anyu. */

import { assessRisk } from "@/lib/safety";
import { suggestScale } from "@/lib/scales";

export type Lang = "zh" | "en";
export type { SupportRegion } from "@/lib/support-regions";
export type AgeRange = "adult" | "minor" | "unspecified";

export type Persona = {
  id: string;
  av: string;
  crisis?: boolean;
  name: Record<Lang, string>;
  role: Record<Lang, string>;
  blurb?: Record<Lang, string>;
};

export type Media = { id: string; type: "image" | "video"; url: string; name?: string };

// A knowledge-base source actually consulted for a reply (shown to the user as
// 数据来源 with a clickable, checkable link — see the X-Knowledge response header).
export type KnowledgeRef = { title: string; source?: string; url?: string; quote?: string; kind?: "kb" | "web" };

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  media?: Media[];
  streaming?: boolean;
  personaId?: string;
  startedAt?: number; // ms timestamp when the request was sent — for a REAL elapsed counter
  errored?: boolean; // the reply failed (truthful error state, not "still generating")
  visionPending?: boolean; // image(s) are being read by /api/vision (transient)
  refs?: KnowledgeRef[]; // RAG sources consulted for this reply (visible 数据来源)
  thinking?: string; // deep-tier reasoning ("思考过程"), shown in a collapsible panel
  pace?: "deep" | "fast"; // which tier produced this reply (for the mode badge)
  safety?: "safe" | "unchecked" | "gentle" | "suicide_concern" | "crisis"; // Kimi danger-check result
  feedback?: "up" | "down"; // per-turn beta feedback ("有帮到 / 没帮到"), device-local only
  replyToId?: string;
  modelContent?: string;
  retryable?: boolean;
  hadImages?: boolean;
};

export type ScaleId = "PHQ-9" | "GAD-7" | "ISI";

export type Scale = {
  id: ScaleId;
  opts: string;
  maxEach: number;
  name: Record<Lang, string>;
  intro: Record<Lang, string>;
  items: Record<Lang, string[]>;
  bands: Array<{ max: number; zh: string; en: string; desc: Record<Lang, string> }>;
};

// ---- companion (single) ----
const COMPANION: Persona = {
  id: "linxi",
  av: "#6FB0A0",
  name: { zh: "安屿", en: "Anyu" },
  role: { zh: "你的陪伴者", en: "Your companion" },
  blurb: {
    zh: "以倾听为主，融合稳定化与温和的认知视角。我会一直在。",
    en: "Listening first, with grounding and a gentle cognitive lens. I'll stay."
  }
};
const CRISIS: Persona = {
  id: "jingshi",
  av: "#D9734E",
  crisis: true,
  name: { zh: "安屿", en: "Anyu" },
  role: { zh: "此刻，只陪你安全", en: "Right now, just keeping you safe" }
};
export const PERSONAS: Persona[] = [COMPANION];
export const personaById = (id?: string): Persona => (id === "jingshi" ? CRISIS : COMPANION);

// ---- i18n ----
export const STR = {
  zh: {
    sub: "JÌNGSHÌ",
    privacy_a: "历史保存在此浏览器", privacy_b: "随时可", privacy_del: "删除本地记录",
    delete_title: "删除此浏览器的对话记录？", delete_body: "将清除此浏览器的当前及往次对话、结束小结、草稿、量表、「对你的理解」、反馈、年龄和地区偏好，并停止当前请求。无法撤回服务方已处理的数据，也不会删除你已下载或分享的文件。此操作无法撤销。", delete_confirm: "删除本地记录", delete_cancel: "取消",
    placeholder: "慢慢写，我在听…",
    import_image: "导入图片", import_video: "导入视频", import_media: "添加图片或视频",
    att_too_many: "最多只能添加 {n} 张图片", att_not_image: "只能添加图片", att_too_big: "图片超过 {mb}MiB，请先缩小或压缩后重试。", att_read_failed: "图片读取失败，请重新选择。", att_remove: "移除图片", att_error_close: "关闭图片提示",
    placeholder_calm: "如果想说点什么，我在这里",
    input_too_long: "太长了，分几次说",
    send: "发送", enter_hint: "Enter 发送 · Shift+Enter 换行", jump_latest: "回到最新",
    status_connecting: "连接中", status_thinking: "思考中", status_writing: "正在回应",
    err_busy: "消息有点频繁，先歇一会儿再发。", err_connect: "连接出错了，请稍后再试。", err_too_long: "这段话太长了，请分几次发给我。", retry: "重试", vision_loading: "正在看图…",
    pace_deep: "深度", pace_fast: "快速",
    pace_hint: "深度：先推理再回应、展示思考过程，更慢更细致；快速：跳过推理、即时回应。",
    think_label: "思考过程", think_hint: "深度模式下 AI 回应前的推理草稿，可能粗糙、不完整，仅作透明参考——它不是给你的建议。",
    safety_label: "安全识别", safety_checking: "识别中…", safety_safe: "未见风险", safety_unchecked: "未启用", safety_flagged: "检测到风险，请看下方资源", safety_gentle: "附了一句温和确认",
    disclaimer: "我是 AI 陪伴，不是医生或持证咨询师",
    switch_persona: "更换陪伴者", persona_title: "选择此刻陪你的人", persona_sub: "切换会改变陪伴的方式，随时可以换回来。",
    current: "正在陪你",
    tools: "练习与工具", tools_sub: "需要时随时取用，没有打卡，没有进度。",
    breathing: "呼吸练习", breathing_d: "跟着节奏，让身体先慢下来。",
    grounding: "落地练习", grounding_d: "用五感把自己带回此时此地。",
    scales: "情绪自评", scales_d: "温和的小问卷，帮你和我看清楚一些。",
    scales_sub: "都是匿名的临床自评量表，结果只作参考，不下诊断。", scale_items_zh: "题", scale_mins: "约 1 分钟",
    scale_suggest: "要不要花 1 分钟做个简短的自评？只是帮我们看清楚一些，不是诊断。", scale_suggest_cta: "做个自评", scale_dismiss: "暂时不用",
    safety_tip: "如果你现在有危险，请联系当地急救或身边可信赖的人。也可以点「真人支持」选择所在地区的帮助。", safety_tip_dismiss: "我知道了",
    crisis_tool: "我现在很危险", crisis_tool_d: "立刻看到热线和真人支持。",
    case_title: "对你的理解", case_note: "这些是我在对话里逐渐形成的理解，可能不准确，你可以随时纠正我。",
    case_empty: "我们才刚开始，我还没有足够的了解来谈你。多和我说几句，我会慢慢看懂，再写在这里。",
    case_loading: "让我回顾一下我们聊过的……",
    case_main: "主诉", case_trigger: "可能的触发", case_hyp: "暂时的工作假设", case_strength: "我看到你的力量",
    crisis_banner_t: "我注意到你现在可能很痛苦", crisis_banner_s: "你不必独自撑着——这里有可以马上联系的真人。",
    crisis_open: "看看支持", crisis_exit: "我没事了", crisis_title: "此刻，安全最重要",
    crisis_q_label: "现在的情况?轻点一下告诉我",
    crisis_q1: "1 · 我已移开危险物品", crisis_q2: "2 · 我身边有人", crisis_q3: "3 · 我准备打电话", crisis_q4: "4 · 我现在做不到",
    real_human: "我是 AI，没办法在现实里陪在你身边。如果你有伤害自己的念头，请现在联系下面的真人——他们能真正帮到你。",
    hotline_label: "当地支持与紧急服务",
    h_psy: "全国心理援助热线", h_police: "公安报警", h_med: "急救",
    h_us988: "自杀与危机生命线(美国)", h_samaritans: "撒玛利亚会(英国/爱尔兰)", h_finder: "查找当地热线(全球)",
    emergency_contact: "联系我的紧急联系人", emergency_contact_d: "你之前留下的、信任的人",
    safety_title: "现在可以做的几件事",
    safety_1: "如果身边有可能伤害自己的东西，先把它放到拿不到的地方。",
    safety_2: "如果可以，到一个有人的地方，或让一个人过来陪你。",
    safety_3: "喝一口水，把脚踩在地上，感受地面在支撑你。",
    safety_4: "拨打上面任意一个号码，告诉对方你现在的感受。",
    calm_breathe: "先一起呼吸",
    breathe_in: "吸气", breathe_hold: "停一下", breathe_out: "呼气", breathe_done: "练习完成 · 做得很好",
    next: "下一题", prev: "上一题", finish: "看看结果", retake: "重新测", done: "好的",
    result_foot: "这只是一个自评参考，不是诊断。真正的评估需要专业人员面对面进行。如果分数让你担心，可以带着它去找现实中的咨询师或医生。",
    today_intro: "你愿意和我说说，最近是什么让你想来这里吗？没有顺序，想到哪说到哪都可以。",
    welcome_line: "这里很安静，只有我们俩。\n你不必准备好，也不必说得清楚。",
    starters: ["我最近睡不太好", "心里有点乱，想说说", "只是想找个人待着"],
    consent_title: "在开始之前",
    consent_p1_t: "我是谁", consent_p1_d: "我是 AI 陪伴练习伙伴，不是心理治疗，也不是医疗服务，不能替代专业帮助。",
    consent_p2_t: "如果你正处于危机",
    consent_p3_t: "你的数据如何处理", consent_p3_d: "发送后，文字会经服务器交给 DeepSeek 生成回复，并可能由 Kimi 做安全识别和理解；图片由 Kimi 处理，必要时还会使用检索服务。历史保存在此浏览器。删除本地记录无法撤回服务方已处理的数据。请避免提供姓名、住址等个人身份信息。",
    consent_p4_t: "这是内测版本", consent_p4_d: "当前为内测版本，回复可能不完善；你可以对每条回复标记有没有帮到你。",
    consent_agree: "点击下方按钮，即代表你已阅读并了解以上内容。", consent_enter: "我了解了，开始对话",
    feedback_up: "有帮到", feedback_down: "没帮到",
    msg_delete: "删除这条消息及关联记录", msg_delete_confirm: "确认删除?",
    export_feedback: "导出内测反馈", export_feedback_note: "导出文件包含被评价的对话片段，仅在你主动分享时才会离开设备。",
    about_title: "关于安屿",
    about_who: "安屿是「静室」里陪你的声音——温柔、专注、不评判。以倾听为主，需要时融入稳定化练习和温和的认知视角。",
    about_voice_t: "安屿的声音",
    about_voice: "先听懂你、再陪你慢慢看——不急、不评判、不说教。需要时，我会用具体的话陪你看清想法和情绪，一次只走一小步。",
    about_voice_samples: ["听起来这件事压在你心上挺久了。", "我们先不急着想办法，你愿意多说说吗？", "今天先到这就好——只写一句最沉的话。"],
    about_honest_t: "我是 AI，不是医生",
    about_honest: "我不会、也不能做诊断或开处方。我能做的，是认真听你、陪你慢下来。",
    about_privacy_t: "本地历史与远端处理",
    about_privacy: "聊天历史保存在此浏览器。发送的文字和图片需要服务器、模型及必要的检索服务处理。删除本地记录会清除此浏览器的当前及往次对话、小结、量表、理解、反馈和年龄地区偏好，无法撤回服务方已处理的数据或你已分享的文件。",
    support_title: "真人支持", support_region: "支持资源地区", support_region_note: "请按你所在地区选择；语言设置不会更改地区。", support_other_note: "如果正有紧急危险，请联系当地急救服务或身边可信赖的人。可通过下方目录查找所在地区的支持。", support_intro: "不必等到危机时刻，也可以向真人求助。以下链接会打开电话或外部支持网站。",
    support_call_note: "短号码通常需使用当地电话网络；接听语言与时段请查看机构说明。", support_sources: "机构说明：",
    close: "关闭", language_label: "切换语言", theme_label: "切换明暗主题", age_label: "年龄范围（可跳过）", age_adult: "18 岁及以上", age_minor: "未满 18 岁", age_unspecified: "暂不选择", minor_note: "如果你未满 18 岁，遇到让你害怕或难以承受的事，可以找可信赖的成年人一起寻求帮助。这里不能替代专业人员或现实中的照顾。",
    scale_safety_title: "先关心一下你的安全", scale_safety_note: "谢谢你告诉我。刚才关于死亡或伤害自己的回答值得单独关心，无论总分多少。你现在有伤害自己的打算，或已经做了可能伤害自己的事吗？如果眼下有危险，请先联系急救或身边可信赖的人。", scale_safety_continue: "我现在安全，继续查看", scale_safety_resources: "查看真人支持", scale_score_reference: "总分参考", feedback_export_failed: "导出失败，请重试。",
    about_safety_t: "危险时，我会带你找真人",
    about_safety: "如果出现伤害自己的念头，我会把现实中的热线和紧急联系放在最显眼的地方。"
  },
  en: {
    sub: "QUIET ROOM",
    privacy_a: "History is saved in this browser", privacy_b: "You can", privacy_del: "delete local records",
    delete_title: "Delete this browser’s conversation records?", delete_body: "This clears current and past conversations, closing summaries, drafts, self-checks, understanding, feedback, age and region preferences in this browser, and stops active requests. It cannot recall data already processed by providers or delete files you downloaded or shared. This cannot be undone.", delete_confirm: "Delete local records", delete_cancel: "Cancel",
    placeholder: "I’m listening…",
    import_image: "Import image", import_video: "Import video", import_media: "Add image or video",
    att_too_many: "Up to {n} images", att_not_image: "Images only", att_too_big: "This image exceeds {mb}MiB. Resize or compress it, then try again.",
    placeholder_calm: "If you'd like to say something, I'm here",
    input_too_long: "That's a lot — try splitting it up",
    send: "Send", enter_hint: "Enter to send · Shift+Enter for a new line", jump_latest: "Jump to latest",
    status_connecting: "Connecting", status_thinking: "Thinking", status_writing: "Replying",
    err_busy: "A bit too many messages — please wait a moment.", err_connect: "Connection error — please try again.", err_too_long: "That message was too long — please send it in a few parts.", retry: "Retry", vision_loading: "Looking at the image…",
    pace_deep: "Depth", pace_fast: "Quick",
    pace_hint: "Depth: reasons first and shows its thinking — slower, more considered. Quick: skips reasoning, replies instantly.",
    think_label: "Reasoning", think_hint: "The model's working-out before replying (deep mode) — rough, for transparency only, not advice for you.",
    safety_label: "Safety check", safety_checking: "checking…", safety_safe: "no risk flagged", safety_unchecked: "not run", safety_flagged: "risk flagged — see resources below", safety_gentle: "added a gentle check-in",
    disclaimer: "I'm an AI companion — not a doctor or licensed therapist",
    switch_persona: "Change companion", persona_title: "Who's with you right now", persona_sub: "Switching changes how I support you. You can switch back anytime.",
    current: "With you now",
    tools: "Practices & tools", tools_sub: "Use whenever you need. No streaks, no progress to keep.",
    breathing: "Breathing", breathing_d: "Follow the rhythm, let your body slow first.",
    grounding: "Grounding", grounding_d: "Use your senses to come back to here and now.",
    scales: "Self check-in", scales_d: "Gentle short questionnaires to see things more clearly.",
    scales_sub: "Anonymous clinical self-checks. Results are a reference, never a diagnosis.", scale_items_zh: "items", scale_mins: "~1 min",
    scale_suggest: "Would a 1-minute self check-in help us see things more clearly? It's a reference, not a diagnosis.", scale_suggest_cta: "Take it", scale_dismiss: "Not now",
    safety_tip: "If you are in danger, contact local emergency services or someone you trust nearby. Open Human support to choose resources for your region.", safety_tip_dismiss: "Got it",
    crisis_tool: "I'm in danger now", crisis_tool_d: "See hotlines and real-person support now.",
    case_title: "What I understand", case_note: "This is the understanding I've slowly formed in our talk. It may be wrong — please correct me anytime.",
    case_empty: "We've only just begun — I don't yet understand enough to say. Tell me a little more and I'll slowly piece it together here.",
    case_loading: "Let me look back over what we've talked about…",
    case_main: "Main concern", case_trigger: "Possible triggers", case_hyp: "A tentative working idea", case_strength: "Strengths I see in you",
    crisis_banner_t: "I notice you may be in a lot of pain right now", crisis_banner_s: "You don't have to hold this alone — real people are reachable right now.",
    crisis_open: "See support", crisis_exit: "I'm okay now", crisis_title: "Right now, safety matters most",
    crisis_q_label: "How are things right now? Tap one",
    crisis_q1: "1 · I moved dangerous items away", crisis_q2: "2 · Someone is with me", crisis_q3: "3 · I am about to call", crisis_q4: "4 · I cannot do this right now",
    real_human: "I'm an AI — I can't be with you in person. If you're having thoughts of harming yourself, please reach a real person below now. They can truly help.",
    hotline_label: "Local support and emergency services",
    h_psy: "Psychological support line", h_police: "Police", h_med: "Emergency medical",
    h_us988: "Suicide & Crisis Lifeline (US)", h_samaritans: "Samaritans (UK/Ireland)", h_finder: "Find a helpline (global)",
    emergency_contact: "Reach my emergency contact", emergency_contact_d: "Someone you trust, saved earlier",
    safety_title: "A few things you can do now",
    safety_1: "If anything nearby could hurt you, move it out of reach first.",
    safety_2: "If you can, go where other people are, or ask someone to come.",
    safety_3: "Sip some water. Put your feet on the floor and feel it hold you.",
    safety_4: "Call any number above and tell them how you feel right now.",
    calm_breathe: "Breathe together",
    breathe_in: "Breathe in", breathe_hold: "Hold", breathe_out: "Breathe out", breathe_done: "Done · you did well",
    next: "Next", prev: "Back", finish: "See result", retake: "Retake", done: "Done",
    result_foot: "This is a self-check reference, not a diagnosis. A real assessment needs a professional, in person. If the score worries you, bring it to a real counselor or doctor.",
    today_intro: "Would you tell me what's been bringing you here lately? No order needed — wherever you'd like to begin.",
    welcome_line: "It's quiet here — just the two of us.\nYou don't have to be ready, or say it clearly.",
    starters: ["I haven't been sleeping well", "My mind feels tangled", "I just want company"],
    consent_title: "Before we begin",
    consent_p1_t: "Who I am", consent_p1_d: "I'm an AI companion for practice — not therapy, not a medical service, and not a substitute for professional help.",
    consent_p2_t: "If you're in crisis right now",
    consent_p3_t: "How your data is processed", consent_p3_d: "Sent text passes through our server to DeepSeek for replies, and may be processed by Kimi for safety checks and understanding. Kimi processes images; search services may also be used when needed. History is saved in this browser. Deleting local records cannot recall data already processed by providers. Avoid names, addresses or other identifying information.",
    consent_p4_t: "This is a beta", consent_p4_d: "This is an early beta — replies may be imperfect. You can mark whether each reply actually helped.",
    consent_agree: "Tapping the button below means you've read and understood the above.", consent_enter: "I understand — let's begin",
    feedback_up: "Helpful", feedback_down: "Not helpful",
    msg_delete: "Delete this message and related records", msg_delete_confirm: "Confirm delete?",
    export_feedback: "Export beta feedback", export_feedback_note: "The exported file includes the rated conversation snippets — it only leaves your device if you choose to share it.",
    about_title: "About Anyu",
    about_who: "Anyu is the voice that keeps you company in Jingshi — gentle, attentive, non-judging. Listening first, with grounding and a soft cognitive lens when it helps.",
    about_voice_t: "Anyu's voice",
    about_voice: "Catch you first, then look slowly together — unhurried, non-judging, no lecturing. When it helps, I use concrete words to look at thoughts and feelings with you, one small step at a time.",
    about_voice_samples: ["It sounds like this has been weighing on you for a while.", "Let's not rush to fixes — would you tell me a bit more?", "Let's stop here for today — just one heaviest sentence."],
    about_honest_t: "I'm an AI, not a doctor",
    about_honest: "I can't and won't diagnose or prescribe. What I can do is listen closely and slow down with you.",
    about_privacy_t: "Local history and remote processing",
    about_privacy: "History is saved in this browser. Sent text and images are processed by our server, model providers and search services when needed. Deleting local records clears current and past conversations, summaries, self-checks, understanding, feedback, age and region preferences. It cannot recall data already processed by providers or files you shared.",
    support_title: "Human support", support_region: "Support resource region", support_region_note: "Choose your location. Changing the language does not change this region.", support_other_note: "If you are in immediate danger, contact local emergency services or someone you trust nearby. The directory below can help you find support in your region.", support_intro: "You can reach a real person before things become a crisis. These links open a phone call or an external support website.",
    support_call_note: "Short numbers usually require a local phone network. Check the service for languages and opening hours.", support_sources: "Service information: ",
    close: "Close", language_label: "Change language", theme_label: "Change color theme", age_label: "Age range (optional)", age_adult: "18 or older", age_minor: "Under 18", age_unspecified: "Prefer not to choose", minor_note: "If you are under 18 and something feels frightening or too much to handle, a trusted adult can help you reach support. This space cannot replace professional help or care in your life.",
    scale_safety_title: "Let’s check on your safety", scale_safety_note: "Thank you for telling me. Your answer about death or self-harm deserves attention on its own, whatever the total score. Do you intend to hurt yourself now, or have you already done something that could hurt you? If you are in immediate danger, contact emergency services or someone you trust nearby first.", scale_safety_continue: "I’m safe right now — continue", scale_safety_resources: "See human support", scale_score_reference: "Total score reference", feedback_export_failed: "The export failed. Please try again.",
    att_read_failed: "The image could not be read. Please select it again.", att_remove: "Remove image", att_error_close: "Dismiss image notice",
    about_safety_t: "In danger, I point you to real people",
    about_safety: "If thoughts of self-harm appear, I help you find real-world support and encourage reaching someone you trust nearby."
  }
};

// ---- scales (PHQ-9 / GAD-7 / ISI) ----
export const SCALE_OPTS: Record<string, Record<Lang, string[]>> = {
  freq4: {
    zh: ["完全没有", "有几天", "一半以上的天数", "几乎每天"],
    en: ["Not at all", "Several days", "More than half the days", "Nearly every day"]
  },
  isi5: {
    zh: ["没有", "轻度", "中度", "重度", "极重度"],
    en: ["None", "Mild", "Moderate", "Severe", "Very severe"]
  }
};

export const SCALES: Record<string, Scale> = {
  "PHQ-9": {
    id: "PHQ-9", opts: "freq4", maxEach: 3,
    name: { zh: "PHQ-9 · 抑郁自评", en: "PHQ-9 · Depression" },
    intro: { zh: "在过去两周里，以下情况让你感到困扰的频率是？", en: "Over the last 2 weeks, how often have you been bothered by…" },
    items: {
      zh: ["做事时提不起劲或没有兴趣", "感到心情低落、沮丧或绝望", "入睡困难、睡不安稳或睡得太多", "感觉疲倦或没有精力", "食欲不振或吃太多", "觉得自己很糟、或让自己/家人失望", "难以集中精神，例如读书或看电视时", "动作或说话变慢、或坐立难安", "有不如死掉或伤害自己的念头"],
      en: ["Little interest or pleasure in doing things", "Feeling down, depressed, or hopeless", "Trouble sleeping, or sleeping too much", "Feeling tired or having little energy", "Poor appetite or overeating", "Feeling bad about yourself, or letting others down", "Trouble concentrating, e.g. reading or TV", "Moving/speaking slowly, or being restless", "Thoughts that you'd be better off dead, or of hurting yourself"]
    },
    bands: [
      { max: 4, zh: "几乎没有", en: "Minimal", desc: { zh: "目前看起来没有明显的抑郁困扰。照顾好自己，需要时随时回来。", en: "Little sign of depression right now. Keep caring for yourself; come back anytime." } },
      { max: 9, zh: "轻度", en: "Mild", desc: { zh: "有一些低落的信号。给自己多一点耐心，我们可以慢慢聊聊。", en: "Some low signals. Be patient with yourself — we can talk it through." } },
      { max: 14, zh: "中度", en: "Moderate", desc: { zh: "困扰已经有一定程度。如果方便，考虑找现实中的咨询师聊聊会有帮助。", en: "A moderate level of distress. Seeing a real counselor could help if you can." } },
      { max: 19, zh: "中重度", en: "Mod.-severe", desc: { zh: "你正承受不小的压力。强烈建议联系专业人员，你值得被认真对待。", en: "You're carrying a lot. Reaching a professional is strongly suggested — you deserve real care." } },
      { max: 27, zh: "重度", en: "Severe", desc: { zh: "这是相当沉重的程度。请尽快联系专业人员或信任的人，你不需要独自扛。", en: "This is heavy. Please reach a professional or someone you trust soon — not alone." } }
    ]
  },
  "GAD-7": {
    id: "GAD-7", opts: "freq4", maxEach: 3,
    name: { zh: "GAD-7 · 焦虑自评", en: "GAD-7 · Anxiety" },
    intro: { zh: "在过去两周里，以下情况让你感到困扰的频率是？", en: "Over the last 2 weeks, how often have you been bothered by…" },
    items: {
      zh: ["感到紧张、焦虑或心里发慌", "无法停止或控制担忧", "对各种各样的事情过度担忧", "很难放松下来", "坐立不安，难以安静地坐着", "变得容易烦躁或易怒", "感到害怕，好像有可怕的事会发生"],
      en: ["Feeling nervous, anxious, or on edge", "Not being able to stop or control worrying", "Worrying too much about different things", "Trouble relaxing", "Being so restless it's hard to sit still", "Becoming easily annoyed or irritable", "Feeling afraid as if something awful might happen"]
    },
    bands: [
      { max: 4, zh: "几乎没有", en: "Minimal", desc: { zh: "目前焦虑水平不明显。挺好的，记得继续照顾自己。", en: "Anxiety seems low right now. Good — keep looking after yourself." } },
      { max: 9, zh: "轻度", en: "Mild", desc: { zh: "有一些紧绷的感觉。一起做做呼吸练习也许会舒服一点。", en: "Some tension. A breathing practice together might ease it a little." } },
      { max: 14, zh: "中度", en: "Moderate", desc: { zh: "焦虑已经在影响你了。我们可以慢慢看看它从哪里来。", en: "Anxiety is affecting you. We can gently look at where it comes from." } },
      { max: 21, zh: "重度", en: "Severe", desc: { zh: "焦虑程度较高。考虑联系现实中的专业人员，会比独自应对轻松些。", en: "Anxiety is high. Reaching a real professional may be easier than facing it alone." } }
    ]
  },
  ISI: {
    id: "ISI", opts: "isi5", maxEach: 4,
    name: { zh: "ISI · 失眠自评", en: "ISI · Insomnia" },
    intro: { zh: "想想最近两周的睡眠，下面这些情况的严重程度是？", en: "Thinking of the last 2 weeks of sleep, how severe is…" },
    items: {
      zh: ["入睡困难的程度", "维持睡眠（夜间易醒）的程度", "太早醒来的程度", "对目前睡眠状况的不满意程度", "失眠对日常生活的干扰程度", "他人能察觉你睡眠问题影响生活的程度", "你为目前的睡眠问题感到担忧/苦恼的程度"],
      en: ["Difficulty falling asleep", "Difficulty staying asleep", "Waking up too early", "Dissatisfaction with current sleep", "Interference with daily functioning", "How noticeable your sleep problem is to others", "How worried/distressed you are about your sleep"]
    },
    bands: [
      { max: 7, zh: "没有失眠", en: "No insomnia", desc: { zh: "睡眠目前看起来还可以。如果偶尔难睡，我可以陪你放松。", en: "Sleep looks okay for now. If a night is hard, I can help you wind down." } },
      { max: 14, zh: "轻度失眠", en: "Subthreshold", desc: { zh: "有一些睡眠困扰。规律的睡前放松也许会慢慢有帮助。", en: "Some sleep trouble. A regular wind-down may slowly help." } },
      { max: 21, zh: "中度失眠", en: "Moderate", desc: { zh: "失眠已经比较明显，影响到白天。可以考虑寻求专业的睡眠帮助。", en: "Insomnia is notable and affects your days. Professional sleep help is worth considering." } },
      { max: 28, zh: "重度失眠", en: "Severe", desc: { zh: "睡眠困扰相当严重。建议联系医生或睡眠专科，不必硬撑。", en: "Sleep trouble is severe. Please consider a doctor or sleep specialist — no need to tough it out." } }
    ]
  }
};

// crisis detection (UI banner trigger; the real safety reply is decided server-side by /api/chat)
export function detectRisk(text?: string): boolean {
  const risk = assessRisk(text || "");
  return risk.shouldEscalate || risk.flags.includes("suicide_concern");
}

// Surface a self-assessment scale ONLY when the conversation shows a matching
// need (no permanent UI entry). Returns the most-specific scale id, or null.
export function detectScaleNeed(text?: string): ScaleId | null {
  const id = suggestScale(text || "");
  return id === "PHQ-9" || id === "GAD-7" || id === "ISI" ? id : null;
}
