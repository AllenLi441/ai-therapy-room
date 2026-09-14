import type { ChatMessage } from "./types";
import { isInfoSeeking } from "./knowledge";
import { KNOWLEDGE_REFERENCE_CARDS } from "./knowledge-reference-cards";

// Search providers receive only these public topic labels, never the user's narrative,
// case formulation, name, contact details, or an assistant's inferred diagnosis.
// This is a small, inspectable query vocabulary, not a clinical classifier.
const TOPICS: Array<{ query: string; pattern: RegExp }> = [
  { query: "睡眠 失眠 睡不着", pattern: /睡眠|失眠|睡不着|睡不好|入睡困?难|半夜醒|早醒|熬夜|作息|\b(sleep|insomnia|sleepless)\b/i },
  { query: "社交焦虑", pattern: /社交焦虑|不敢当众|怕.{0,5}评价|怕.{0,3}出丑|\bsocial anxiety\b/i },
  { query: "惊恐发作", pattern: /惊恐|恐慌发作|突然心跳很快|\bpanic\b/i },
  { query: "焦虑 担忧", pattern: /焦虑|担忧|担心|紧张|不安|心慌|\b(anxiety|anxious|worry|worried|worries|nervous)\b/i },
  { query: "压力 应对压力", pattern: /压力|紧绷|\b(stress|stressed|overwhelmed)\b/i },
  { query: "职业倦怠 工作压力", pattern: /倦怠|工作.{0,5}(耗竭|精疲力竭)|\bburnout\b/i },
  { query: "情绪低落 抑郁", pattern: /抑郁|情绪低落|提不起劲|兴趣减退|\b(depression|depressed|low mood)\b/i },
  { query: "行为激活 没动力", pattern: /行为激活|没动力|不想动|什么都不想做|\b(behavioral activation|behavioural activation|motivation)\b/i },
  { query: "哀伤 丧亲 失去亲人", pattern: /哀伤|丧亲|亲人去世|失去亲人|悲伤|\b(grief|grieving|bereavement)\b/i },
  { query: "孤独 社会连接", pattern: /孤独|孤单|寂寞|社会连接|\b(lonely|loneliness|social connection|isolated)\b/i },
  { query: "心理咨询 心理治疗", pattern: /心理咨询|咨询师|心理治疗|心理医生|\b(therapy|therapist|psychotherapy|counseling|counselling)\b/i },
  { query: "心理求助渠道", pattern: /专业支持|心理支持|心理资源|咨询机构|\bmental health (support|help|resources)\b/i },
  { query: "就诊准备 症状记录", pattern: /(?:见|看|找)医生.{0,15}(忘|提前|记录)|初诊|就诊准备|(?:咨询|会谈).{0,8}准备|准备.{0,8}(?:咨询|会谈)|\bprepare.{0,12}appointment\b/i },
  { query: "治疗选择 第二意见", pattern: /医生.{0,8}方案|治疗方案|\b(treatment options|second opinion)\b/i },
  { query: "认知行为疗法 CBT", pattern: /认知行为|\bcbt\b/i },
  { query: "接纳承诺疗法 ACT", pattern: /接纳承诺|接纳与承诺|\bacceptance and commitment therapy\b|\bACT\b/ },
  { query: "正念 冥想", pattern: /正念|冥想|\b(mindfulness|mindful|meditation)\b/i },
  { query: "呼吸 放松", pattern: /呼吸练习|慢呼吸|深呼吸|放松练习|\b(breathing|relaxation)\b/i },
  { query: "着陆 5-4-3-2-1 grounding", pattern: /着陆|落地练习|五感|5.?4.?3.?2.?1|\bgrounding\b/i },
  { query: "运动 心理健康", pattern: /运动|锻炼|\b(exercise|physical activity)\b/i },
  { query: "情绪命名 表达感受", pattern: /情绪命名|表达.{0,3}(感受|情绪)|说不清.{0,6}感受|\b(affect labeling|name my feelings|express my feelings)\b/i },
  { query: "自我照顾 心理健康", pattern: /自我照顾|自我关怀|\b(self.care|self.compassion)\b/i },
  { query: "反刍 担忧管理", pattern: /反刍|胡思乱想|脑子停不下来|\b(rumination|ruminating|overthinking)\b/i },
  { query: "假设性担忧 担忧树", pattern: /脑子.{0,10}万一|担心.{0,5}万一|总想.{0,5}万一|可控与不可控|\bhypothetical worry\b/i },
  { query: "人际关系 边界", pattern: /人际|边界|伴侣|恋爱|\b(relationship|relationships|boundaries|partner)\b/i },
  { query: "创伤 PTSD", pattern: /创伤|\b(trauma|ptsd)\b/i },
  { query: "强迫 OCD", pattern: /强迫|\bocd\b/i },
  { query: "注意缺陷 ADHD", pattern: /注意缺陷|多动症|\badhd\b/i },
  { query: "进食障碍", pattern: /进食障碍|暴食|厌食|\b(eating disorder|binge eating)\b/i },
  { query: "酒精 物质使用", pattern: /酒精|酗酒|物质使用|成瘾|\b(alcohol|addiction|substance use)\b/i },
];

const FOLLOW_UP = /这|那|它|这个|那个|继续|具体|再讲|再说|讲细|详细一点|展开|先从|哪一件|方法|办法|建议|怎么|如何|为什么|有用|有效|依据|靠谱吗|\b(it|that|this|more|how|why|help|evidence|work)\b/i;
const ONLY_LISTEN = /只想.{0,5}(倾诉|说说|聊聊)|只听我说|听我说就好|不(要|想|用).{0,6}(建议|方法|教我)|(?:先)?别.{0,5}(建议|方法|教我)|\b(just listen|no advice|don't (give|want) advice)\b/i;
// A question mark alone can be a bid for connection ("你能懂吗？"). Only explicit
// factual/method requests or anchored follow-ups use the direct information voice.
const DIRECT_INFORMATION = /是什么|什么是|定义|区别|比较|科普|介绍|讲解|解释.{0,8}(概念|疗法|机制)|想了解|想知道|有什么.{0,4}(方法|办法|建议)|有没有.{0,4}(方法|办法)|怎么(缓解|改善|应对|处理|做|准备)|该怎么|如何|什么时候|什么情况下|有用吗|有效吗|依据|证据|靠谱吗|费用|多少钱|隐私|保密|具体说说|继续讲|展开讲|\b(what (is|are|causes)|how (do|does|can|to)|when (should|can|to)|explain|define|definition|difference|evidence|tell me (about|more)|learn about|any (tips|advice)|privacy|confidentiality|cost)\b/i;
const EVIDENCE_METRIC = /疗效|效果|治愈率|有效率|成功率|发生率|复发率|风险|概率|几率|比例|百分比|百分之|副作用|有效|管用|\b(efficacy|effectiveness|effective|cure rate|success rate|remission|side effects?|risk|probability|odds|chance|percent(?:age)?)\b/i;
const EVIDENCE_REQUEST = /[?？]|多少|多大|怎么样|是否|能否|有没有|是不是|^(给出|提供|说明)|请.{0,8}(给出|提供|说明)|给.{0,6}(数字|比例|百分比)|\b(what|how|whether|is|are|does|give|provide)\b/i;
const FACETS = [
  { query: "定义 是什么", pattern: /是什么|定义|什么是|\b(what is|what are|define|definition)\b/i },
  { query: "区别 比较", pattern: /区别|比较|一样|\b(difference|compare|versus)\b/i },
  { query: "方法", pattern: /怎么|如何|方法|办法|步骤|做起|先从|\b(how|tips|steps)\b/i },
  { query: "什么时候求助 日常功能", pattern: /(?:什么时候|什么情况下).{0,16}(求助|支持|找专业|找医生|咨询)|工作生活.{0,5}(乱|影响)|\bwhen.{0,24}(help|support|professional|therapist)\b/i },
  { query: "专业背景 咨询师资质", pattern: /咨询师.{0,12}(背景|资质)|选.{0,5}咨询师|\b(credentials|qualifications)\b/i },
  { query: "咨询没进展 咨询目标", pattern: /咨询.{0,12}(原地踏步|没进展|没用)|\btherapy.{0,12}progress\b/i },
  { query: "学校心理中心 员工援助", pattern: /学生.{0,30}(资源|支持)|学校.{0,12}(资源|支持)|\bstudent.{0,15}support\b/i },
  { query: "保密例外", pattern: /保密|隐私|\b(confidentiality|privacy)\b/i },
  { query: "费用", pattern: /费用|价格|多少钱|\b(cost|price|fees)\b/i },
  { query: "证据 效果", pattern: /依据|证据|有效|有用|靠谱|\b(evidence|effective|efficacy)\b/i },
  { query: "疗效统计 风险概率 百分比", pattern: /治愈率|有效率|成功率|发生率|复发率|概率|几率|比例|百分比|百分之|\b(cure rate|success rate|remission|probability|odds|chance|percent(?:age)?)\b/i },
  { query: "惊恐专业支持", pattern: /惊恐.{0,18}(支持|办法|治疗)|\bpanic.{0,15}(support|treatment)\b/i },
  { query: "会谈间练习 咨询作业", pattern: /CBT.{0,12}咨询.{0,12}小时|会谈.{0,5}(之外|以外|之间)|\bbetween sessions\b/i },
];

export type KnowledgeQuery = {
  query: string;
  infoSeeking: boolean;
  contextUsed: boolean;
  topics: string[];
  responseMode: "information" | "support";
};

function topicLabels(text: string): string[] {
  // Exact matched phrases come from the public corpus vocabulary, not arbitrary text
  // spans. Retain specific subtopics (e.g. worry time / consultation privacy) that a
  // broad 'anxiety' label would erase. Use word boundaries for Latin abbreviations.
  const lower = text.toLowerCase();
  const keywords = KNOWLEDGE_REFERENCE_CARDS.flatMap((card) => card.keywords)
    .filter((keyword) => /^[a-z0-9 -]+$/i.test(keyword)
      ? new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
      : lower.includes(keyword.toLowerCase()));
  return [...new Set([...keywords, ...TOPICS.filter(({ pattern }) => pattern.test(text)).map(({ query }) => query)])];
}

/** Deterministic, bounded, topic-only retrieval query. The last user turn owns topic
 * changes. Only a short referential follow-up may inherit the preceding USER's topics;
 * assistant guesses, stored profiles and old case maps cannot contaminate retrieval. */
export function buildKnowledgeQuery(messages: Pick<ChatMessage, "role" | "content">[]): KnowledgeQuery {
  const turns = messages.filter((message) => message.role === "user").slice(-2);
  const current = turns.at(-1)?.content.trim() ?? "";
  const directInformation = DIRECT_INFORMATION.test(current) || (EVIDENCE_METRIC.test(current) && EVIDENCE_REQUEST.test(current));
  const infoSeeking = !ONLY_LISTEN.test(current) && !/缩写.{0,8}字母|字母.{0,8}缩写|\b(spelling|alphabet)\b/i.test(current) &&
    (isInfoSeeking(current) || directInformation);
  let topics = topicLabels(current);
  let contextUsed = false;
  if (infoSeeking && topics.length === 0 && current.length <= 80 && FOLLOW_UP.test(current)) {
    topics = topicLabels(turns.at(-2)?.content ?? "");
    contextUsed = topics.length > 0;
  }
  // Unknown topics intentionally get no search. This is a knowledge coverage miss,
  // not permission for the model to fill in professional facts from memory.
  return {
    query: infoSeeking && topics.length
      ? [...topics.slice(0, 6), ...FACETS.filter(({ pattern }) => pattern.test(current)).map(({ query }) => query)].join(" ").slice(0, 240)
      : "",
    infoSeeking,
    contextUsed,
    topics,
    responseMode: infoSeeking && (directInformation || contextUsed)
      ? "information" : "support",
  };
}
