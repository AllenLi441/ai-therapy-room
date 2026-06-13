/* data.ts — companion, i18n, scales, risk detection (from design handoff).
   The mock streamReply is intentionally dropped — app.tsx streams the real
   /api/chat. Persona id stays "linxi" for backend-contract compatibility;
   display name is 安屿 / Anyu. */

export type Lang = "zh" | "en";

export type Persona = {
  id: string;
  av: string;
  crisis?: boolean;
  name: Record<Lang, string>;
  role: Record<Lang, string>;
  blurb?: Record<Lang, string>;
};

export type Media = { id: string; type: "image" | "video"; url: string; name?: string };

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  media?: Media[];
  streaming?: boolean;
  personaId?: string;
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
export const STR: Record<Lang, Record<string, any>> = {
  zh: {
    sub: "JÌNGSHÌ",
    privacy_a: "对话只存在你的设备", privacy_b: "随时可", privacy_del: "一键彻底删除",
    placeholder: "把现在心里的话，慢慢写下来…",
    import_image: "导入图片", import_video: "导入视频", import_media: "添加图片或视频",
    placeholder_calm: "如果想说点什么，我在这里",
    send: "发送", enter_hint: "Enter 发送 · Shift+Enter 换行",
    pace_deep: "深度", pace_fast: "快速",
    disclaimer: "我是 AI 陪伴，不是医生或持证咨询师",
    switch_persona: "更换陪伴者", persona_title: "选择此刻陪你的人", persona_sub: "切换会改变陪伴的方式，随时可以换回来。",
    current: "正在陪你",
    tools: "练习与工具", tools_sub: "需要时随时取用，没有打卡，没有进度。",
    breathing: "呼吸练习", breathing_d: "跟着节奏，让身体先慢下来。",
    grounding: "落地练习", grounding_d: "用五感把自己带回此时此地。",
    scales: "情绪自评", scales_d: "温和的小问卷，帮你和我看清楚一些。",
    scales_sub: "都是匿名的临床自评量表，结果只作参考，不下诊断。", scale_items_zh: "题", scale_mins: "约 1 分钟",
    crisis_tool: "我现在很危险", crisis_tool_d: "立刻看到热线和真人支持。",
    case_title: "对你的理解", case_note: "这些是我在对话里逐渐形成的理解，可能不准确，你可以随时纠正我。",
    case_main: "主诉", case_trigger: "可能的触发", case_hyp: "暂时的工作假设", case_strength: "我看到你的力量",
    crisis_banner_t: "我注意到你现在可能很痛苦", crisis_banner_s: "你不必独自撑着——这里有可以马上联系的真人。",
    crisis_open: "看看支持", crisis_title: "此刻，安全最重要",
    real_human: "我是 AI，没办法在现实里陪在你身边。如果你有伤害自己的念头，请现在联系下面的真人——他们能真正帮到你。",
    hotline_label: "可以马上拨打",
    h_psy: "全国心理援助热线", h_police: "公安报警", h_med: "急救",
    emergency_contact: "联系我的紧急联系人", emergency_contact_d: "你之前留下的、信任的人",
    safety_title: "现在可以做的几件事",
    safety_1: "如果身边有可能伤害自己的东西，先把它放到拿不到的地方。",
    safety_2: "如果可以，到一个有人的地方，或让一个人过来陪你。",
    safety_3: "喝一口水，把脚踩在地上，感受地面在支撑你。",
    safety_4: "拨打上面任意一个号码，告诉对方你现在的感受。",
    calm_title: "我们先慢下来", calm_sub: "复杂的东西先放一边。此刻，只做你能做的一件事就好。",
    calm_breathe: "先一起呼吸", calm_hotline: "联系热线", calm_contact: "联系紧急联系人", calm_back: "我好一些了，回到对话",
    breathe_in: "吸气", breathe_hold: "停一下", breathe_out: "呼气", breathe_done: "练习完成 · 做得很好",
    next: "下一题", prev: "上一题", finish: "看看结果", retake: "重新测", done: "好的",
    result_foot: "这只是一个自评参考，不是诊断。真正的评估需要专业人员面对面进行。如果分数让你担心，可以带着它去找现实中的咨询师或医生。",
    today_intro: "你愿意和我说说，最近是什么让你想来这里吗？没有顺序，想到哪说到哪都可以。",
    welcome_line: "这里很安静，只有我们俩。\n你不必准备好，也不必说得清楚。",
    starters: ["我最近睡不太好", "心里有点乱，想说说", "只是想找个人待着"],
    about_title: "关于安屿",
    about_who: "安屿是「静室」里陪你的声音——温柔、专注、不评判。以倾听为主，需要时融入稳定化练习和温和的认知视角。",
    about_honest_t: "我是 AI，不是医生",
    about_honest: "我不会、也不能做诊断或开处方。我能做的，是认真听你、陪你慢下来。",
    about_privacy_t: "对话只在你的设备",
    about_privacy: "这些话不会离开这台设备，你随时可以一键彻底删除。",
    about_safety_t: "危险时，我会带你找真人",
    about_safety: "如果出现伤害自己的念头，我会把现实中的热线和紧急联系放在最显眼的地方。"
  },
  en: {
    sub: "QUIET ROOM",
    privacy_a: "Chats stay only on your device", privacy_b: "Always", privacy_del: "delete everything",
    placeholder: "Take your time — write what's on your mind…",
    import_image: "Import image", import_video: "Import video", import_media: "Add image or video",
    placeholder_calm: "If you'd like to say something, I'm here",
    send: "Send", enter_hint: "Enter to send · Shift+Enter for a new line",
    pace_deep: "Depth", pace_fast: "Quick",
    disclaimer: "I'm an AI companion — not a doctor or licensed therapist",
    switch_persona: "Change companion", persona_title: "Who's with you right now", persona_sub: "Switching changes how I support you. You can switch back anytime.",
    current: "With you now",
    tools: "Practices & tools", tools_sub: "Use whenever you need. No streaks, no progress to keep.",
    breathing: "Breathing", breathing_d: "Follow the rhythm, let your body slow first.",
    grounding: "Grounding", grounding_d: "Use your senses to come back to here and now.",
    scales: "Self check-in", scales_d: "Gentle short questionnaires to see things more clearly.",
    scales_sub: "Anonymous clinical self-checks. Results are a reference, never a diagnosis.", scale_items_zh: "items", scale_mins: "~1 min",
    crisis_tool: "I'm in danger now", crisis_tool_d: "See hotlines and real-person support now.",
    case_title: "What I understand", case_note: "This is the understanding I've slowly formed in our talk. It may be wrong — please correct me anytime.",
    case_main: "Main concern", case_trigger: "Possible triggers", case_hyp: "A tentative working idea", case_strength: "Strengths I see in you",
    crisis_banner_t: "I notice you may be in a lot of pain right now", crisis_banner_s: "You don't have to hold this alone — real people are reachable right now.",
    crisis_open: "See support", crisis_title: "Right now, safety matters most",
    real_human: "I'm an AI — I can't be with you in person. If you're having thoughts of harming yourself, please reach a real person below now. They can truly help.",
    hotline_label: "Call now",
    h_psy: "Psychological support line", h_police: "Police", h_med: "Emergency medical",
    emergency_contact: "Reach my emergency contact", emergency_contact_d: "Someone you trust, saved earlier",
    safety_title: "A few things you can do now",
    safety_1: "If anything nearby could hurt you, move it out of reach first.",
    safety_2: "If you can, go where other people are, or ask someone to come.",
    safety_3: "Sip some water. Put your feet on the floor and feel it hold you.",
    safety_4: "Call any number above and tell them how you feel right now.",
    calm_title: "Let's slow down first", calm_sub: "Set the complicated things aside. Right now, just one thing you can do.",
    calm_breathe: "Breathe together", calm_hotline: "Call a hotline", calm_contact: "Reach my contact", calm_back: "I feel a bit better — back to the chat",
    breathe_in: "Breathe in", breathe_hold: "Hold", breathe_out: "Breathe out", breathe_done: "Done · you did well",
    next: "Next", prev: "Back", finish: "See result", retake: "Retake", done: "Done",
    result_foot: "This is a self-check reference, not a diagnosis. A real assessment needs a professional, in person. If the score worries you, bring it to a real counselor or doctor.",
    today_intro: "Would you tell me what's been bringing you here lately? No order needed — wherever you'd like to begin.",
    welcome_line: "It's quiet here — just the two of us.\nYou don't have to be ready, or say it clearly.",
    starters: ["I haven't been sleeping well", "My mind feels tangled", "I just want company"],
    about_title: "About Anyu",
    about_who: "Anyu is the voice that keeps you company in Jingshi — gentle, attentive, non-judging. Listening first, with grounding and a soft cognitive lens when it helps.",
    about_honest_t: "I'm an AI, not a doctor",
    about_honest: "I can't and won't diagnose or prescribe. What I can do is listen closely and slow down with you.",
    about_privacy_t: "Chats stay on your device",
    about_privacy: "None of this leaves this device. You can delete everything in one tap, anytime.",
    about_safety_t: "In danger, I point you to real people",
    about_safety: "If thoughts of self-harm appear, I put real-world hotlines and your emergency contact front and center."
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
const RISK_RE =
  /(不想活|不想再活|自杀|结束生命|结束自己|活不下去|去死|想死|轻生|伤害自己|割腕|跳下去|没有意义.*活|活着.*没意义|end my life|kill myself|suicide|don'?t want to live|hurt myself|want to die)/i;
export function detectRisk(text?: string): boolean {
  return RISK_RE.test(text || "");
}
