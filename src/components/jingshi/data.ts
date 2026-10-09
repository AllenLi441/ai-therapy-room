/* data.ts — companion, i18n, scales, risk detection (from design handoff).
   The mock streamReply is intentionally dropped — app.tsx streams the real
   /api/chat. Persona id stays "linxi" for backend-contract compatibility;
   display name is 安屿 / Anyu. */

import { assessRisk } from "@/lib/safety";
import { suggestScale } from "@/lib/scales";
import type { AppLanguage, ContentLanguage } from "@/lib/languages";
import { STR_ZH_HANT } from "./i18n/zh-Hant";
import { STR_JA } from "./i18n/ja";
import { STR_KO } from "./i18n/ko";
import { STR_ES } from "./i18n/es";
import { STR_FR } from "./i18n/fr";
import { STR_DE } from "./i18n/de";

export type Lang = AppLanguage;
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
  thinking?: string; // thinking-phase buffer; the server sends markers only (no reasoning text)
  thinkingMs?: number; // how long the model thought before answering → "思考了 N 秒"
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
  name: Record<ContentLanguage, string>;
  intro: Record<ContentLanguage, string>;
  items: Record<ContentLanguage, string[]>;
  bands: Array<{ max: number; zh: string; en: string; desc: Record<ContentLanguage, string> }>;
};

// ---- companion (single) ----
const COMPANION: Persona = {
  id: "linxi",
  av: "#6FB0A0",
  name: { zh: "安屿", "zh-Hant": "安嶼", en: "Anyu", ja: "Anyu", ko: "Anyu", es: "Anyu", fr: "Anyu", de: "Anyu" },
  role: { zh: "你的陪伴者", "zh-Hant": "你的陪伴者", en: "Your companion", ja: "あなたのそばにいる人", ko: "당신 곁의 동행자", es: "Tu compañía", fr: "Ta présence à tes côtés", de: "Deine Begleitung" },
  blurb: {
    zh: "以倾听为主，融合稳定化与温和的认知视角。我会一直在。",
    "zh-Hant": "以傾聽為主，融合穩定化與溫和的認知視角。我會一直在。",
    en: "Listening first, with grounding and a gentle cognitive lens. I'll stay.",
    ja: "聴くことを第一に、心を落ち着ける工夫とやさしい考え方の視点を添えて。ずっとここにいます。",
    ko: "먼저 귀 기울이고, 마음을 안정시키는 방법과 부드러운 생각의 관점을 함께 써요. 계속 여기 있을게요.",
    es: "Primero escuchar, con ejercicios para calmarte y una mirada amable a los pensamientos. Aquí sigo.",
    fr: "D’abord écouter, avec des repères pour s’apaiser et un regard doux sur les pensées. Je reste là.",
    de: "Zuerst zuhören, mit Übungen zum Ankommen und einem sanften Blick auf Gedanken. Ich bleibe da."
  }
};
const CRISIS: Persona = {
  id: "jingshi",
  av: "#D9734E",
  crisis: true,
  name: { zh: "安屿", "zh-Hant": "安嶼", en: "Anyu", ja: "Anyu", ko: "Anyu", es: "Anyu", fr: "Anyu", de: "Anyu" },
  role: { zh: "此刻，只陪你安全", "zh-Hant": "此刻，只陪你安全", en: "Right now, just keeping you safe", ja: "今は、あなたの安全だけを", ko: "지금은 당신의 안전만 생각할게요", es: "Ahora mismo, solo tu seguridad", fr: "Pour l’instant, seulement ta sécurité", de: "Gerade jetzt zählt nur deine Sicherheit" }
};
export const PERSONAS: Persona[] = [COMPANION];
export const personaById = (id?: string): Persona => (id === "jingshi" ? CRISIS : COMPANION);

// ---- i18n ----
// Complete dictionaries for every interface language; zh is the reference shape.
const STR_ZH = {
    sub: "JÌNGSHÌ",
    privacy_a: "历史保存在此浏览器", privacy_b: "随时可", privacy_del: "删除本地记录",
    delete_title: "删除此浏览器的对话记录？", delete_body: "将清除此浏览器的当前及往次对话、结束小结、草稿、量表、「对你的理解」、反馈、年龄和地区偏好，并停止当前请求。无法撤回服务方已处理的数据，也不会删除你已下载或分享的文件。此操作无法撤销。", delete_confirm: "删除本地记录", delete_cancel: "取消",
    placeholder: "慢慢写，我在听…",
    import_image: "导入图片", import_video: "导入视频", import_media: "添加图片或视频",
    voice_start: "语音输入", voice_hint: "用浏览器自带的语音识别转成文字（部分浏览器会把声音交给浏览器厂商的服务器识别）。文字会先放进输入框，确认后再发送。", voice_stop: "停止语音输入", voice_denied: "没有拿到麦克风权限。可以在浏览器设置里允许，或者直接打字。", voice_network: "这个浏览器的语音识别服务暂时连不上，可以换用 Safari 或 Edge，或者直接打字。", voice_failed: "这次没听清，可以再试一次。",
    share_title: "愿意让我们用你的对话来改进静室吗？",
    share_desc: "可以随时在设置里关闭。",
    share_yes: "同意", share_no: "不同意", share_14: "我已年满 14 岁", share_need_age: "选「同意」需要先在上面选年龄范围。", share_need_14: "未满 18 岁需要确认已年满 14 岁，才能选同意。", settings_title: "设置", share_delete: "删除我已上传的对话", share_deleted: "已删除，上传过的对话已从数据库移除。", share_delete_failed: "删除没有成功，可以稍后再试。", share_none: "还没有上传过对话。", starters_refresh: "换一批",
    att_too_many: "最多只能添加 {n} 张图片", att_not_image: "只能添加图片", att_too_big: "图片超过 {mb}MiB，请先缩小或压缩后重试。", att_read_failed: "图片读取失败，请重新选择。", att_remove: "移除图片", att_error_close: "关闭图片提示",
    placeholder_calm: "如果想说点什么，我在这里",
    input_too_long: "太长了，分几次说",
    send: "发送", enter_hint: "Enter 发送 · Shift+Enter 换行", jump_latest: "回到最新",
    status_connecting: "连接中", status_thinking: "思考中", status_writing: "正在回应",
    err_busy: "消息有点频繁，先歇一会儿再发。", err_connect: "连接出错了，请稍后再试。", err_too_long: "这段话太长了，请分几次发给我。", retry: "重试", vision_loading: "正在看图…",
    pace_deep: "深度", pace_fast: "快速",
    pace_hint: "深度：先完成安全识别再回答，查资料更全面，用更强的模型，回答更细致；快速：更快开始回答，安全识别同时进行。",
    think_label: "思考", think_done: "思考了 {s} 秒",
    think_levels: { off: "不思考", low: "思考：低", high: "思考：高", max: "思考：最强" },
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
    hello: "你好，我是安屿。",
    err_storage_save: "浏览器暂时无法保存记录。请导出需要保留的内容，避免刷新后丢失。", err_storage_clear: "浏览器未允许清除记录，请在浏览器设置中清除此网站的数据。",
    reply_stopped: "回应已停止，可重试这一轮。", err_image_not_stored: "原图不会保存在浏览器记录中，请重新添加图片后发送。", err_image_unread: "没有读到图片内容，请重试。", image_sent: "（我发了一张图片）",
    case_wait: "请等当前回应结束后再更新。", case_changed: "对话已有更新，请重新整理。", case_failed: "暂时没能更新理解。原有内容仍保留，可以重试。", case_edited_notice: "已保留你的修改，不会自动覆盖。需要时可手动重新整理。",
    case_update: "重新整理", case_edit_note: "你可以修正不准确的内容，或留空删除。多条触发因素和力量请各写一行。保存后的理解会用于后续对话。", case_save: "保存修改", case_edit: "修正我的理解", case_clear: "清空理解",
    summary_failed: "暂时没能生成小结。可以重试，或直接写下你想记住的话。", import_failed: "无法导入这个文件。请选择静室导出的记录文件（不超过12MiB）。",
    pause_today: "今天先到这里", past_sessions: "往次记录", support_short: "支持", you: "你",
    refs_summary: "本轮参考资料 · {n} 条（点开核对原文）", refs_note: "这是本轮检索到的参考资料，不表示每条资料都被回答采用，也不代表回答中的每个判断已被验证。可打开原文核对；一般科普信息不替代专业诊疗。", refs_live: "实时", refs_view: "查看来源 ↗",
    retry_note_image: "请重新添加图片后发送。", retry_note_text: "请重新发送这条消息。", reading_images: "正在读取图片…", stop_reply: "停止回应", reply_mode: "回应方式",
    backup_title: "备份与更换域名", backup_body: "不同域名不会自动共享浏览器记录。你可以导出后在新域名导入。文件包含敏感的对话内容，请自行妥善保管，仅在可信设备导入。每段最多保留最近120条消息。原图不包含在记录备份中；历史图片描述可能保留。", backup_export: "导出我的记录", backup_import: "导入记录",
    summary_intro: "留下一点你愿意带走的东西。小结可以修改，也可以只写自己的话。", summary_loading: "正在回顾这段对话…", summary_retry: "重新生成", summary_field: "这次想记下的", next_step_field: "我愿意试的一小步（可不填）",
    summary_note: "只保存在此浏览器，可在「往次记录」里接着聊或删除。小结可能有误，以你的理解为准。", summary_saved: "已保存。下次可以从往次记录接着聊。", summary_save: "保存小结", summary_save_new: "保存并开始新对话",
    history_note: "最多保留最近20段已保存的小结与对话。继续某段对话会替换当前打开的对话，请先保存当前小结。", history_empty: "还没有往次记录。在对话后选择「今天先到这里」即可保存。", history_next_step: "自选的一小步：", history_read: "查看这段对话",
    history_continue: "接着这段聊", history_delete: "删除这段记录", history_confirm_label: "确认删除记录", history_confirm_q: "删除这段已保存的记录？此操作无法撤销。", history_delete_confirm: "确认删除",
    import_title: "导入记录", import_body: "文件包含当前对话{m}条消息、{s}段往次记录。导入会替换此浏览器现有对话和往次记录，请先导出需要保留的内容。", import_local: "文件仅在本机读取；之后继续聊天时，相关对话内容会发送到服务端处理。", import_confirm: "替换并导入",
    scale_lang_note: "",
    consent_title: "在开始之前",
    consent_p1_t: "我是谁", consent_p1_d: "我是 AI 陪伴练习伙伴，不是心理治疗，也不是医疗服务，不能替代专业帮助。",
    consent_p2_t: "如果你正处于危机",
    consent_p3_t: "你的数据如何处理", consent_p3_d: "发送后，文字会经服务器交给 DeepSeek 生成回复并做安全识别（DeepSeek 不可用时由 Kimi 备用识别）；「对你的理解」和图片由 Kimi 处理；需要查资料时，只把话题关键词（不含你的原话）发给检索和联网搜索服务。历史保存在此浏览器。删除本地记录无法撤回服务方已处理的数据。请避免提供姓名、住址等个人身份信息。",
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
};
export type Dict = typeof STR_ZH;
const STR_EN: Dict = {
    sub: "QUIET ROOM",
    privacy_a: "History is saved in this browser", privacy_b: "You can", privacy_del: "delete local records",
    delete_title: "Delete this browser’s conversation records?", delete_body: "This clears current and past conversations, closing summaries, drafts, self-checks, understanding, feedback, age and region preferences in this browser, and stops active requests. It cannot recall data already processed by providers or delete files you downloaded or shared. This cannot be undone.", delete_confirm: "Delete local records", delete_cancel: "Cancel",
    placeholder: "I’m listening…",
    import_image: "Import image", import_video: "Import video", import_media: "Add image or video",
    voice_start: "Voice input", voice_hint: "Uses your browser's built-in speech recognition (some browsers send the audio to the browser maker's servers). The text goes into the box first so you can check it before sending.", voice_stop: "Stop voice input", voice_denied: "Microphone access was not allowed. You can allow it in browser settings, or just type.", voice_network: "This browser's speech service can't be reached right now. Try Safari or Edge, or just type.", voice_failed: "Didn't catch that. You can try again.",
    share_title: "Will you let us use your conversations to help improve Jingshi?",
    share_desc: "You can turn this off any time in Settings.",
    share_yes: "Agree", share_no: "Don't agree", share_14: "I'm 14 or older", share_need_age: "To agree, first choose your age range above.", share_need_14: "If you're under 18, confirm you're at least 14 to agree.", settings_title: "Settings", share_delete: "Delete my uploaded conversations", share_deleted: "Deleted. Your uploaded conversations were removed from the database.", share_delete_failed: "Deleting didn't work. Please try again later.", share_none: "No conversations uploaded yet.", starters_refresh: "Show others",
    att_too_many: "Up to {n} images", att_not_image: "Images only", att_too_big: "This image exceeds {mb}MiB. Resize or compress it, then try again.",
    placeholder_calm: "If you'd like to say something, I'm here",
    input_too_long: "That's a lot — try splitting it up",
    send: "Send", enter_hint: "Enter to send · Shift+Enter for a new line", jump_latest: "Jump to latest",
    status_connecting: "Connecting", status_thinking: "Thinking", status_writing: "Replying",
    err_busy: "A bit too many messages — please wait a moment.", err_connect: "Connection error — please try again.", err_too_long: "That message was too long — please send it in a few parts.", retry: "Retry", vision_loading: "Looking at the image…",
    pace_deep: "Depth", pace_fast: "Quick",
    pace_hint: "Depth: finishes the safety check before replying, looks things up more thoroughly and uses a stronger model — more considered. Quick: starts replying sooner while the safety check runs alongside.",
    think_label: "Thinking", think_done: "Thought for {s}s",
    think_levels: { off: "No thinking", low: "Thinking: low", high: "Thinking: high", max: "Thinking: max" },
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
    hello: "Hi, I'm Anyu.",
    err_storage_save: "This browser could not save your records. Export what you want to keep before refreshing.", err_storage_clear: "This browser did not allow deletion. Clear this site's data in browser settings.",
    reply_stopped: "Reply stopped. You can retry this turn.", err_image_not_stored: "Original images are not stored in history. Please attach the image again.", err_image_unread: "The image could not be read. Please retry.", image_sent: "(I sent an image)",
    case_wait: "Wait for the current reply before updating.", case_changed: "The conversation changed. Please update again.", case_failed: "Could not update this time. Your existing notes are kept; you can retry.", case_edited_notice: "Your edits are kept and will not be overwritten automatically. You can update manually.",
    case_update: "Update understanding", case_edit_note: "Correct anything inaccurate, or leave it blank to remove it. Use one line per trigger or strength. Your saved understanding will inform future conversations.", case_save: "Save changes", case_edit: "Edit this understanding", case_clear: "Clear understanding",
    summary_failed: "Could not create a note this time. Retry, or write what you want to remember yourself.", import_failed: "Cannot import this file. Choose a Jingshi records export under 12MiB.",
    pause_today: "Pause for today", past_sessions: "Past conversations", support_short: "Support", you: "You",
    refs_summary: "Retrieved references · {n} (open to check)", refs_note: "These references were retrieved for this turn. Their presence does not mean every source was used or every claim in the reply was verified. Open the originals to check; general information does not replace professional care.", refs_live: "live", refs_view: "View source ↗",
    retry_note_image: "Please attach the image again and send it.", retry_note_text: "Please send this message again.", reading_images: "Reading images…", stop_reply: "Stop reply", reply_mode: "Reply mode",
    backup_title: "Backup and moving to a new domain", backup_body: "Browser records do not move automatically between domains. Export them here, then import on the new domain. The file contains sensitive conversations: keep it private and import only on a trusted device. Each conversation keeps up to 120 recent messages. Original images are not included in backups; descriptions of earlier images may be retained.", backup_export: "Export my records", backup_import: "Import records",
    summary_intro: "Keep what matters to you. Edit this note, or write it in your own words.", summary_loading: "Looking back over this conversation…", summary_retry: "Try again", summary_field: "What I want to remember", next_step_field: "One step I choose (optional)",
    summary_note: "Saved in this browser. Revisit or delete it in Past conversations. This note can be wrong; your view comes first.", summary_saved: "Saved. You can continue from Past conversations.", summary_save: "Save note", summary_save_new: "Save and start fresh",
    history_note: "Keeps up to 20 saved conversations. Continuing one replaces the open conversation; save your current note first.", history_empty: "No saved conversations yet. Choose Pause for today after a chat.", history_next_step: "My next step: ", history_read: "Read this conversation",
    history_continue: "Continue this conversation", history_delete: "Delete this record", history_confirm_label: "Confirm deletion", history_confirm_q: "Delete this saved record? This cannot be undone.", history_delete_confirm: "Delete record",
    import_title: "Import records", import_body: "This file contains {m} messages and {s} saved conversations. Import replaces this browser's current and saved conversations. Export anything you want to keep first.", import_local: "The file is read locally. Relevant conversation content will be sent to the service when you continue chatting.", import_confirm: "Replace and import",
    scale_lang_note: "",
    consent_title: "Before we begin",
    consent_p1_t: "Who I am", consent_p1_d: "I'm an AI companion for practice — not therapy, not a medical service, and not a substitute for professional help.",
    consent_p2_t: "If you're in crisis right now",
    consent_p3_t: "How your data is processed", consent_p3_d: "Sent text passes through our server to DeepSeek for replies and safety checks (Kimi checks safety as a backup if DeepSeek is unavailable). Kimi processes images and the \"What I understand\" notes. When something needs looking up, only topic keywords — never your own words — go to retrieval and web-search services. History is saved in this browser. Deleting local records cannot recall data already processed by providers. Avoid names, addresses or other identifying information.",
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
};
export const STR: Record<Lang, Dict> = { zh: STR_ZH, "zh-Hant": STR_ZH_HANT, en: STR_EN, ja: STR_JA, ko: STR_KO, es: STR_ES, fr: STR_FR, de: STR_DE };

// ---- scales (PHQ-9 / GAD-7 / ISI) ----
export const SCALE_OPTS: Record<string, Record<ContentLanguage, string[]>> = {
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
