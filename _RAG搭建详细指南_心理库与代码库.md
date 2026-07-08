# 从零搭建 RAG 知识库：心理医生 + 编程工坊完整实战指南

> 写给有干劲的学习者。内容对齐你三个真实项目的代码，可以直接复制跑起来。
> 
> 最后更新：2026-06-17

---

## 目录

1. [开篇·建立心智模型](#开篇建立心智模型)
2. [第一部分·通用流程五步详解](#第一部分通用流程五步详解)
3. [第二部分·心理医生实战（关键词版，今天就能跑）](#第二部分心理医生实战关键词版今天就能跑)
4. [第三部分·CodeNexus 实战（向量版，Supabase pgvector）](#第三部分codenexus实战向量版supabase-pgvector)
5. [第四部分·agent-starter 实战（Agentic RAG）](#第四部分agent-starter实战agentic-rag)
6. [第五部分·关键词版 vs 向量版怎么选 + 升级路线 + 评估 + 常见坑](#第五部分关键词版vs向量版怎么选升级路线评估常见坑)

---

## 开篇·建立心智模型

### RAG 是什么？用开卷考试理解

你做题的时候有两种模式：

- **闭卷**：全靠脑子里已经记住的东西答。大模型本身就是这样，它把互联网训练进去了，但知识是截止到训练日期的，专有领域的内容它不知道，还可能一本正经地编。
- **开卷**：考试前先去翻书，找到相关页面，结合书上的知识作答。RAG（Retrieval-Augmented Generation，检索增强生成）就是这个思路。

RAG 的三步：

1. **检索（Retrieval）**：用户问了一个问题，先去知识库里找最相关的几段内容，就像考试前先翻书找到对应章节。
2. **增强（Augmentation）**：把找到的内容拼进"提示词"里，告诉大模型"参考这些资料"。
3. **生成（Generation）**：大模型基于这些资料 + 对话历史生成最终回答，而不是全靠记忆瞎编。

这样做的好处是：知识库你说了算，随时更新，不用重新训练模型。模型回答的依据是你放进去的内容，可追溯、可审核。

### 你的三个 AI 现在在哪里

你已经有三个项目，状态各不相同：

**项目 A：心理医生（镜室 / AI Therapy Room）**

架子完全在，只差内容。`src/app/api/chat/route.ts` 的第 250 行已经在调用 `retrieveKnowledge(query, 4)`，query 由 `profile.concern` + 用户最新消息 + `caseMap` 的字段拼出来，返回的卡片数组会通过 `buildCounselorSystemPrompt` 注入到【可参考的心理支持知识】那一节。但 `knowledge.ts` 里的 `retrieveKnowledge` 现在是个空壳，直接 `return []`。

所以你今天要做的只有一件事：**给 `knowledge.ts` 填上真实的知识卡 + 检索逻辑**，其他代码一行都不用改。

**项目 B：CodeNexus（编程工坊/frontend）**

这是一个 Next.js 编程学习平台，用 Supabase 做后端，`package.json` 里已经有 `openai` 和 `@supabase/supabase-js`。AI 助教的聊天走 `/api/chat/route.ts`，system prompt 里有 `【本机记忆摘要】` 那一节（对应 `assistantMemorySummary` 字段）。这里最适合做向量版的代码知识库：用 pgvector 存课程讲义和常见报错，检索后注入到 `assistantMemorySummary`。

**项目 C：agent-starter（编程工坊/agent-starter）**

一个 Python 迷你 agent，用 Anthropic SDK，有 `mini_agent.py`（循环主体）和 `tools.py`（工具定义 + 分发）。这里适合做 "Agentic RAG"：给 agent 加一个 `search_knowledge` 工具，让 agent 自己决定什么时候需要查知识库，而不是每次都强制塞进 prompt。

---

## 第一部分·通用流程五步详解

无论是心理知识库还是代码知识库，无论是关键词检索还是向量检索，搭 RAG 的流程都是这五步：找素材 → 切片 → 打标签/向量化 → 存入 → 检索注入。下面把每一步讲透。

---

### 步骤 1：找素材

#### 找什么、从哪找

素材就是你希望 AI "查阅"的参考资料。原则是：质量 > 数量，宁愿少而精、可信、有针对性，也不要把所有东西都塞进去。

**心理领域**找这些：

- **循证框架文本**：CBT（认知行为治疗）、DBT（辩证行为治疗）、ACT（接受承诺治疗）、MI（动机访谈）的核心概念和干预步骤。不用买教材全本——从权威来源（如 Beck Institute、NIMH 官网）摘核心段落即可，也可以用你们内部的督导手册。
- **你们自己的临床材料**：督导笔记、个案概念化模板、已有的评估工具说明（比如 PHQ-9 各分段的回应建议）。这些是最宝贵的，因为它们对齐了你们产品的风格。
- **危机资源**：本地热线号码、危机干预步骤（C-SSRS 量表的分级处置建议）。注意：这些内容需要临床团队核实，不能从网上随便抄。
- **常见主诉应对**：失眠、人际冲突、职场压力、情绪调节困难等具体主题的应对方案。一个主题写一张卡。

**代码领域**找这些：

- **你们自己的课程讲义**：每一关的教学说明、常见卡点、预期输出。这是最有价值的，因为它和你们平台强绑定。
- **常见报错 → 修复对**：从历史对话里整理"用户报了什么错、怎么解决的"。比如 Python 缩进错误、变量未定义、类型错误这类高频问题。
- **Python/JS 关键语法说明**：for 循环、函数定义、列表操作，写成口语化、面向初学者的解释。
- **官方文档摘抄**：只摘你们平台教学范围内的，不要搬运整个官方文档——太大、噪声多。

#### 版权和可信度注意事项

- 教材章节、论文全文一般有版权，直接复制有风险。建议用自己的话提炼核心知识点，或者只用你们自己创作的材料。
- 网络上的"心理学科普"文章质量参差不齐，不要直接用，要经过临床团队审核。
- 热线电话、危机资源要核实准确性，过期的号码比没有更危险。

#### 整理成结构化格式

拿到原始素材后，先整理成方便处理的格式：

- 如果是 PDF 或 Word，先提取成纯文本（.txt 或 .md）。
- 如果是口述或录音，先转成文字稿。
- 建议每个"主题"放一个单独的文件，文件名就是主题（`cbt-negative-thoughts.md`、`sleep-disorder.md`）。

---

### 步骤 2：切片（Chunking）

#### 为什么要切

两个原因：

1. **上下文长度限制**：大模型的 context window 是有限的（比如 8K、32K tokens）。如果你把整本手册塞进去，token 会爆，或者费用很高。你只需要塞进去"和当前问题最相关的那几段"，不是全部。
2. **检索精度**：块太大，检索时"一块里包含很多不相关的内容"，相关度评分会被稀释，命中率下降。块太小，上下文不完整，回答没有依据。

#### 几种切法及取舍

**按语义单元切（最推荐）**

一个知识点 = 一块。心理领域的"认知重构步骤"是一个语义单元，"DBT 情绪调节技术"是另一个。代码领域的"Python for 循环语法"是一块，"IndexError 报错的常见原因"是另一块。

优点：检索出来的内容最完整、最有意义。缺点：需要人工划分，不能全自动。

**按标题/章节切**

适用于有清晰章节结构的文档（Markdown 里的 `##` 标题、Word 里的 Heading 1/2）。按标题切，每个章节是一块。

优点：半自动，容易实现。缺点：章节长度可能差异很大，有的章节很长（变成大块），有的很短（变成碎块）。

**固定长度 + 重叠（overlap）**

把文本每隔 N 个字切一刀，相邻块之间有 M 个字的重叠（避免一个完整句子被切断放在两块之间，导致两块都不完整）。比如每块 500 字，相邻块重叠 100 字。

优点：完全自动化。缺点：可能在句子中间切断，块的语义边界不清晰。

#### 建议的块大小

- 心理知识库：**一张卡 = 一个主题**，内容字数大约 200–500 字。你们现有的 `KnowledgeCard` 类型天然就是按主题切的，直接遵循这个设计。
- 代码知识库：**一节讲义 / 一个报错案例 = 一块**，大约 300–600 字。不要把两个不同的报错类型放在一块里。

#### 正例 vs 反例

**反例（太大）**：把 CBT 整个章节（2000 字，涉及自动思维、核心信念、认知重构、行为激活……）放成一块。检索"如何处理自动思维"时，这块里的其他内容会干扰相关度评分，而且塞进 prompt 后会占很多 token。

**正例（刚好）**：把"识别和挑战自动思维"这一个技术写成一块（300 字左右），单独存一张卡，专门讲这一个技术，不混入其他技术。

**反例（太小）**：每句话切成一块。"自动思维是指在特定情境下自动浮现的想法。"这一句单独成块，缺乏上下文，检索出来 AI 不知道怎么用。

---

### 步骤 3：打标签 / 向量化

这是两条不同的技术路线，决定了你用哪种检索方式。

#### 关键词版：打标签

给每一块内容定义一组关键词（`keywords`）和标签（`tags`）。检索时用字符串匹配来判断相关度。

关键词要包含：
- **症状词、口语表达**：用户真正会说的话。不是"情绪调节障碍"，是"控制不住情绪"、"一点小事就崩"、"总是莫名想哭"。
- **专业词 + 口语同义词**：比如"反刍"这个词用户可能不知道，但"反复回想"、"脑子停不下来"他们会说。两类都要加。
- **相关主题词**：能覆盖这张卡的各种问法。

**举例**：一张讲"睡眠问题"的卡，关键词可以是：`["失眠", "睡不着", "入睡困难", "早醒", "睡眠质量差", "脑子停不下来", "睡前焦虑", "睡眠障碍", "ISI"]`

标签（`tags`）用来做大类过滤，比如 `["CBT", "睡眠", "焦虑"]`。标签是分类，关键词是具体匹配用的。

#### 向量版：Embedding

Embedding（嵌入）是把一段文字转成一个高维数字向量（比如 1536 维的浮点数数组），语义相近的文字在向量空间里位置也相近。

**怎么得到向量**：调用 Embedding API，传入文本，返回向量。比如 OpenAI 的 `text-embedding-3-small`：

```javascript
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: '你好，我最近总是睡不着觉'
})
const vector = response.data[0].embedding // 一个长度 1536 的数组
```

**检索时怎么用**：把用户的问题也转成向量，然后在数据库里找"向量最近"的那几块内容。"最近"用余弦相似度（cosine similarity）衡量，值越接近 1 越相似。

**选哪个 Embedding 模型**：

| 模型 | 维度 | 价格 | 特点 |
|------|------|------|------|
| OpenAI `text-embedding-3-small` | 1536 | 低 | 性价比最高，中文效果不错 |
| OpenAI `text-embedding-3-large` | 3072 | 中 | 效果更好，适合重要知识库 |
| 智谱 `embedding-2` | 1024 | 低 | 中文优化，国内用户友好 |

CodeNexus 的 `package.json` 里已经有 `openai` 包，直接用 `text-embedding-3-small` 最省事。

#### 两种方式对比

| 对比项 | 关键词版 | 向量版 |
|--------|----------|--------|
| 实现复杂度 | 低，零依赖，纯 TS/Python | 高，需要 Embedding API + 向量数据库 |
| 检索精度 | 精确匹配，不理解语义 | 语义理解，能处理同义词和模糊表达 |
| 成本 | 零 API 费用 | 每次写入和查询都需要调 Embedding API |
| 适合场景 | 专业领域、已知关键词的场景 | 用户表达多变、需要语义理解的场景 |
| 知识库规模 | 适合几十到几百张卡 | 适合几千到几万块内容 |

心理医生：用**关键词版**（今天就能跑，你已经知道用户会说什么症状词）。
CodeNexus：用**向量版**（课程内容多，用户问法多变，语义检索更准）。

---

### 步骤 4：存入（建库）

#### 关键词版怎么存

最简单的方式：直接把知识卡写成 TypeScript 数组，导出为模块。

```typescript
// src/lib/knowledge-cards.ts
import type { KnowledgeCard } from "./types";

export const KNOWLEDGE_CARDS: KnowledgeCard[] = [
  {
    id: "sleep-001",
    title: "入睡困难与睡前焦虑",
    tags: ["CBT", "睡眠", "焦虑"],
    keywords: ["失眠", "睡不着", "入睡困难", "睡前焦虑", "脑子停不下来", "早醒", "睡眠质量差", "ISI"],
    content: "入睡困难通常与睡前过度激活有关……",
    guidance: ["先共情睡眠困扰带来的疲惫感", "询问睡前具体在想什么，帮助识别反刍内容"]
  }
];
```

然后 `retrieveKnowledge` 从这个数组里检索。

这种方式的好处是：零数据库依赖，代码审查友好（Git diff 一看就知道加了什么知识），适合你们这种需要临床评审的场景。

#### 向量版怎么存（选型）

| 选项 | 特点 | 适合场景 |
|------|------|---------|
| 内存（JS/Python 数组） | 最简单，重启清空 | 原型验证 |
| 本地文件（JSON + 向量） | 简单持久化 | 小规模单机应用 |
| pgvector（Supabase） | SQL 友好，无额外服务 | 已经用 Supabase 的项目 ✓ CodeNexus |
| Pinecone / Weaviate | 托管向量数据库 | 大规模专用向量搜索 |
| ChromaDB | 本地 Python 向量库 | Python 项目原型 |

CodeNexus 已经用 Supabase，选 pgvector 扩展是最自然的——一个数据库搞定用户数据 + 向量知识库，不用引入新服务。

---

### 步骤 5：等用户提问时·检索 + 注入

这是 RAG 的"用"阶段，整条链路如下：

```
用户发消息
    ↓
构造检索 query（可以是用户消息原文，也可以拼多个字段）
    ↓
去知识库检索 top-k 个最相关的块
    ↓
把这些块格式化成文字，拼进 system prompt 的指定位置
    ↓
连同 system prompt + 对话历史，一起发给大模型
    ↓
大模型基于知识库内容生成回答
```

#### 关键词检索的打分算法

基本思路：遍历所有知识卡，对每张卡计算一个"命中分"，按分排序，取前 k 张。

命中分怎么算：
1. 把 query 分词（最简单的方式：按空格、标点切开，或者直接用字符级 n-gram）
2. 对每张卡，统计 query 里的词在 `keywords` 里命中了几个，在 `tags` 里命中了几个
3. 字段加权：`keywords` 里命中权重 1.0，`tags` 里命中权重 0.5（也可以给 `title` 加权 0.8）
4. 归一化：除以最高可能得分，得到 0–1 之间的相关度
5. 过滤掉分数为 0 的（完全不相关），剩下的按分排序取 top-k

#### 向量检索的相似度与阈值

余弦相似度越接近 1，表示两个向量（两段文字的语义）越相似。一般设置阈值 0.70–0.75：低于这个阈值的不返回，避免把不相关内容塞进 prompt。

top-k 建议设 3–5：太少可能漏掉关键信息，太多会塞爆 prompt（每块 400 字，5 块就 2000 字，已经很重了）。

#### 注入时放在 prompt 哪里、用什么格式

位置：放在 system prompt 里靠近末尾的专门一节，用清晰的标题标出，比如`【可参考的心理支持知识】`（心理医生已经这样做了）或者`【参考资料】`。

格式：结构化文字，每块内容用编号区分。不要把所有块拼成一大段没有分隔的文字，模型会找不到边界。

约束指令（很重要）：一定要在知识节前后加明确指令，告诉模型怎么用这些资料：

```
以下是和本次对话相关的参考资料，优先依据这些资料回答；
如果资料中没有相关内容，用通用的支持性方式回应，不要编造。
```

如果不加这个约束，模型可能会忽略你提供的资料，或者把资料和自己的"记忆"混用，导致幻觉。

---

## 第二部分·心理医生实战（关键词版，今天就能跑）

### 现状回顾

`src/lib/knowledge.ts` 是这样的（你已经读过了）：

```typescript
// 现在的空壳
export function retrieveKnowledge(_query: string, _limit = 4): KnowledgeCard[] {
  return [];
}
```

`route.ts` 第 250 行已经在调它：

```typescript
const knowledge = retrieveKnowledge(
  [
    body.profile?.concern,
    latestUserMessage.content,
    caseMap?.presenting,
    caseMap?.workingHypothesis,
    ...(caseMap?.triggers ?? []),
    ...(caseMap?.automaticThoughts ?? [])
  ]
    .filter(Boolean)
    .join(" "),
  4
);
```

也就是说，query 是把来访者的主诉 + 最新消息 + 个案概念化字段拼在一起的字符串，limit=4。

检索结果通过 `buildCounselorSystemPrompt` 里的 `formatKnowledge(cards)` 格式化后，放进【可参考的心理支持知识】那一节。

**你要做的只有一件事：把 `knowledge.ts` 里的内容替换成真实的知识卡 + 检索逻辑。**

### KnowledgeCard 类型回顾

来自 `src/lib/types.ts`：

```typescript
export type KnowledgeCard = {
  id: string;       // 唯一 ID，建议 "主题-序号" 格式，如 "sleep-001"
  title: string;    // 简短标题，会出现在 prompt 里
  tags: string[];   // 大类标签，如 ["CBT", "睡眠", "焦虑"]
  keywords: string[]; // 检索关键词（核心），要包含口语、症状词、同义词
  content: string;  // 知识内容（会直接出现在 prompt 里，要写给模型看的）
  guidance: string[]; // 具体回应建议（数组，每条一个建议）
};
```

### 示例知识卡（待临床签字后正式使用）

下面是三张示例卡，格式完全对齐类型定义。**注意：这些示例卡仅作格式示范，内容需经过你们临床团队评审和签字后才能正式使用。**

```typescript
// 示例卡 1：入睡困难与睡前焦虑
const sleepCard: KnowledgeCard = {
  id: "sleep-001",
  title: "入睡困难与睡前焦虑",
  tags: ["CBT", "睡眠", "焦虑"],
  keywords: [
    "失眠", "睡不着", "入睡困难", "睡前焦虑", "睡眠质量差",
    "早醒", "脑子停不下来", "睡前停不下来", "反刍", "反复回想",
    "ISI", "睡眠障碍", "夜里清醒", "睡着了又醒"
  ],
  content: `入睡困难通常与"睡前过度激活"有关：大脑在应该休息的时候仍然处于高唤醒状态，表现为反复回想白天发生的事、担心明天、身体紧绷。
这种模式常见于焦虑倾向较高的来访者，也和日间压力积累、睡前刺激（手机、咖啡因）有关。
CBT-I（失眠认知行为治疗）的核心是打破"越想睡越睡不着"的焦虑循环，而不是靠意志力强迫自己睡着。`,
  guidance: [
    "先共情睡眠困扰带来的疲惫感：长期睡不好不只是身体累，对情绪和思维的影响也很大，先把这份累说出来",
    "询问睡前具体在想什么，帮助来访者识别反刍内容（是担心具体的事，还是弥漫性的不安）",
    "如果来访者准备好了，可以介绍一个小的睡前'卸载'练习：睡前把今天担心的事写下来，然后告诉自己'已经记下了，明天再想'，减少大脑在夜里继续处理的压力",
    "避免直接建议'不要玩手机、不要喝咖啡'——这些来访者通常已经知道，说了容易让人觉得被说教"
  ]
};

// 示例卡 2：负面自动思维（CBT 核心概念）
const automaticThoughtsCard: KnowledgeCard = {
  id: "cbt-auto-thoughts-001",
  title: "负面自动思维的识别与温和挑战",
  tags: ["CBT", "自动思维", "认知重构"],
  keywords: [
    "自动思维", "负面想法", "总是这样", "我不行", "我太差了",
    "没人喜欢我", "我是累赘", "以偏概全", "灾难化", "读心术",
    "全或无思维", "反复想", "停不下来", "认知扭曲", "控制不了想法"
  ],
  content: `自动思维是在特定情境下自动浮现的快速想法，通常是负面的、未经检验的，但感觉非常真实可信。
常见的认知扭曲模式：
- 全或无思维：非黑即白，"我没做到完美就是彻底失败"
- 灾难化：把一件坏事放大成最坏结果，"这次失误一定会毁了一切"
- 以偏概全：从一次负面经历得出永久性结论，"我总是这样，永远不会好"
- 读心术：认为自己知道别人在想什么，"他们肯定觉得我很蠢"
CBT 的方式不是否定这些想法，而是温和地检验它们：这个想法有没有反驳的证据？如果是朋友有这个想法，你会怎么说？`,
  guidance: [
    "先命名来访者当下的情绪，而不是直接跳到'挑战想法'——情绪没被接住，认知工作没有基础",
    "用试探性语气反映来访者的自动思维，给他们确认或纠正的空间：'听起来有个想法是……，是这样吗？'",
    "挑战思维不是辩论，是帮来访者找到另一个视角：'当你觉得X的时候，有没有任何时候情况不是这样的？'",
    "如果来访者暂时没有准备好'挑战'，只需要被听见，就先停在共情和命名情绪上，不要强推技术"
  ]
};

// 示例卡 3：人际冲突与关系表达
const interpersonalCard: KnowledgeCard = {
  id: "interpersonal-001",
  title: "人际冲突：说出来还是不说",
  tags: ["人际", "关系", "DBT", "沟通"],
  keywords: [
    "人际冲突", "吵架", "矛盾", "说不说", "表达", "憋着",
    "不知道怎么说", "怕说错", "怕被误解", "怕对方生气",
    "委屈", "愤怒", "伴侣", "朋友", "家人", "同事", "边界"
  ],
  content: `在人际冲突中，来访者常常面临两难：说出来担心关系受损或引发更大冲突，不说又积累委屈影响情绪和关系。
DBT 的 DEAR MAN 技术（Describe, Express, Assert, Reinforce, Mindful, Appear confident, Negotiate）提供了一个结构化的表达框架，核心是：描述事实（不评判）、表达感受（我感到……，而不是你让我……）、请求具体行为改变。
重要前提：并不是所有事情都需要立刻说，也不是所有人际冲突都适合直接沟通。有时候先帮来访者理清"我想从这段对话里得到什么"比直接练习表达更重要。`,
  guidance: [
    "先了解来访者对这段关系的期待和当前的关系质量——不同关系背景下，说不说的决策完全不同",
    "共情憋着的委屈：长期压抑情绪有代价，同时也不要急着推'你应该说出来'",
    "如果来访者想练习表达，可以帮他们先想清楚：我想表达什么？我希望对方做什么不同的事？——具体化比情绪宣泄更有效",
    "避免给'你要勇于表达'这样的笼统建议，要落到具体情境和具体的话怎么说"
  ]
};
```

### 写卡模板

每次新增知识卡，按这个模板填：

```typescript
{
  id: "主题缩写-序号",            // 例如 "grief-001", "panic-002"
  title: "简短主题名（10字以内）",
  tags: ["大类1", "大类2"],       // 2-4个，用来做分类过滤
  keywords: [                      // 10-20个，来访者会说的口语、症状词、同义词
    "核心词1", "核心词2",
    "口语表达1", "口语表达2",
    "相关专业词"
  ],
  content: `
  这段话写给模型看，要像一位督导在给咨询师做简报：
  - 这个问题/主题的核心机制是什么
  - 常见的表现/类型有哪些
  - 什么治疗框架/技术适用
  长度建议 150-400 字，不要过长。
  `,
  guidance: [
    "第一条回应建议：要最先做的事（通常是共情或命名情绪）",
    "第二条：具体的干预方向或技术提示",
    "第三条：需要避免的回应方式（可选）"
  ]
}
```

### 完整可用的 retrieveKnowledge 实现

把下面的代码直接替换 `src/lib/knowledge.ts` 的全部内容：

```typescript
import type { KnowledgeCard } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// 知识卡库
// 每张卡对应一个心理支持主题。
//
// ⚠️  安全提示：这里的内容会直接注入到系统 prompt，成为模型对来访者说话的依据。
//     所有卡片在正式上线前必须经过临床团队评审和签字。
//     下方示例卡标注「待临床签字」，请勿在未评审前在生产环境使用。
// ─────────────────────────────────────────────────────────────────────────────

const KNOWLEDGE_CARDS: KnowledgeCard[] = [
  // ── 睡眠 ────────────────────────────────────────────────────────────────────
  {
    id: "sleep-001",
    title: "入睡困难与睡前焦虑",                    // 【待临床签字】
    tags: ["CBT", "睡眠", "焦虑"],
    keywords: [
      "失眠", "睡不着", "入睡困难", "睡前焦虑", "睡眠质量差",
      "早醒", "脑子停不下来", "睡前停不下来", "反刍", "反复回想",
      "ISI", "睡眠障碍", "夜里清醒", "睡着了又醒"
    ],
    content: `入睡困难通常与"睡前过度激活"有关：大脑在应该休息的时候仍处于高唤醒状态，表现为反复回想白天发生的事、担心明天、身体紧绷。这种模式常见于焦虑倾向较高的来访者，也和日间压力积累、睡前刺激（手机、咖啡因）有关。CBT-I 的核心是打破"越想睡越睡不着"的焦虑循环，不是靠意志力强迫自己睡着。`,
    guidance: [
      "先共情睡眠困扰带来的疲惫感：长期睡不好对情绪和思维的影响很大，先把这份累说出来",
      "询问睡前具体在想什么，帮助来访者识别反刍内容",
      "如果来访者准备好了，可以介绍睡前'卸载'练习：把担心的事写下来，然后告诉自己'已经记下了'",
      "不要直接建议'少玩手机'——这类建议来访者通常已经知道，说了容易显得说教"
    ]
  },

  // ── 自动思维 ────────────────────────────────────────────────────────────────
  {
    id: "cbt-auto-thoughts-001",
    title: "负面自动思维的识别与温和挑战",          // 【待临床签字】
    tags: ["CBT", "自动思维", "认知重构"],
    keywords: [
      "自动思维", "负面想法", "总是这样", "我不行", "我太差了",
      "没人喜欢我", "我是累赘", "以偏概全", "灾难化", "读心术",
      "全或无", "反复想", "停不下来", "认知扭曲", "控制不了想法",
      "觉得自己很差", "什么都做不好"
    ],
    content: `自动思维是在特定情境下自动浮现的快速想法，通常是负面的、未经检验的，但感觉非常真实可信。常见的认知扭曲：全或无思维（非黑即白）、灾难化（放大最坏结果）、以偏概全（从一次经历得出永久结论）、读心术（认为知道别人在想什么）。CBT 的方式不是否定这些想法，而是温和地检验它们：有没有反驳的证据？如果是朋友有这个想法，你会怎么说？`,
    guidance: [
      "先命名来访者当下的情绪，情绪没被接住，认知工作没有基础",
      "用试探性语气反映自动思维，给来访者确认或纠正的空间：'听起来有个想法是……，是这样吗？'",
      "挑战思维不是辩论，是帮来访者找到另一个视角：'当你觉得X的时候，有没有任何时候情况不是这样的？'",
      "如果来访者还没准备好挑战，就先停在共情和命名情绪上，不要强推技术"
    ]
  },

  // ── 人际冲突 ─────────────────────────────────────────────────────────────────
  {
    id: "interpersonal-001",
    title: "人际冲突：说出来还是不说",              // 【待临床签字】
    tags: ["人际", "关系", "DBT", "沟通"],
    keywords: [
      "人际冲突", "吵架", "矛盾", "说不说", "表达", "憋着",
      "不知道怎么说", "怕说错", "怕被误解", "怕对方生气",
      "委屈", "愤怒", "伴侣", "朋友", "家人", "同事", "边界",
      "被忽视", "关系冷淡", "冷战"
    ],
    content: `在人际冲突中，来访者常面临两难：说出来担心关系受损，不说又积累委屈。DBT 的 DEAR MAN 技术提供了结构化的表达框架，核心是：描述事实（不评判）、表达感受（我感到……，而不是你让我……）、请求具体行为改变。重要前提：并不是所有事情都需要立刻说，先帮来访者理清"我想从这段对话里得到什么"比直接练习表达更重要。`,
    guidance: [
      "先了解来访者对这段关系的期待——不同关系背景下，说不说的决策完全不同",
      "共情憋着的委屈，不要急着推'你应该说出来'",
      "如果来访者想练习表达，帮他们先具体化：我想表达什么？我希望对方做什么不同的事？",
      "避免'你要勇于表达'这类笼统建议，要落到具体情境和具体的话怎么说"
    ]
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 检索逻辑
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 简单的字符串分词：按常见中文标点、空格、英文单词边界切开，返回 token 集合。
 * 不需要引入任何 NLP 库。
 */
function tokenize(text: string): Set<string> {
  // 转小写，按非字母数字汉字的字符切开，过滤空串
  const tokens = text
    .toLowerCase()
    .split(/[\s，。！？、；：""''【】（）…\-_,.\\/|+*&#@!?;:'"[\](){}]+/)
    .filter(t => t.length >= 1);
  return new Set(tokens);
}

/**
 * 对一张知识卡计算与 query 的相关度得分（0–1）。
 *
 * 打分规则：
 *   - keywords 字段里命中一个词：权重 1.0
 *   - tags 字段里命中一个词：权重 0.5
 *   - title 字段里命中一个词：权重 0.8
 *
 * 最终得分 = 加权命中数 / (keywords.length * 1.0 + tags.length * 0.5 + title词数 * 0.8)
 * 归一化到 0–1，避免关键词多的卡占优。
 *
 * 还增加了一个"直接子串命中"的加分：如果 query 原文包含某个关键词（而不是分词后才命中），
 * 额外加 0.15，提高精准匹配的权重。
 */
function scoreCard(card: KnowledgeCard, queryText: string): number {
  const queryLower = queryText.toLowerCase();
  const queryTokens = tokenize(queryText);

  let weightedHits = 0;
  let maxPossibleWeight = 0;

  // keywords：权重 1.0
  for (const kw of card.keywords) {
    const kwLower = kw.toLowerCase();
    maxPossibleWeight += 1.0;
    if (queryTokens.has(kwLower) || queryLower.includes(kwLower)) {
      weightedHits += 1.0;
      // 直接子串命中额外加分
      if (queryLower.includes(kwLower) && kwLower.length >= 2) {
        weightedHits += 0.15;
      }
    }
  }

  // tags：权重 0.5
  for (const tag of card.tags) {
    const tagLower = tag.toLowerCase();
    maxPossibleWeight += 0.5;
    if (queryTokens.has(tagLower) || queryLower.includes(tagLower)) {
      weightedHits += 0.5;
    }
  }

  // title 里的词：权重 0.8（title 分词处理）
  const titleTokens = tokenize(card.title);
  for (const t of titleTokens) {
    maxPossibleWeight += 0.8;
    if (queryTokens.has(t) || queryLower.includes(t)) {
      weightedHits += 0.8;
    }
  }

  if (maxPossibleWeight === 0) return 0;
  // 裁剪到 1，避免因为加分机制超过 1
  return Math.min(1, weightedHits / maxPossibleWeight);
}

/**
 * 从知识库检索最相关的 limit 张卡。
 *
 * 这是 route.ts 里已经在调用的函数签名，不要改函数名和参数类型。
 *
 * query: 由 profile.concern + 用户最新消息 + caseMap 字段拼成的字符串
 * limit: 默认 4，route.ts 传的也是 4
 *
 * 返回相关度 > 0 的卡片，按相关度降序排列，取前 limit 张。
 * 如果没有任何卡命中，返回空数组（route.ts 里的 formatKnowledge 会处理这种情况）。
 */
export function retrieveKnowledge(query: string, limit = 4): KnowledgeCard[] {
  if (!query || query.trim().length === 0) return [];

  const scored = KNOWLEDGE_CARDS
    .map(card => ({ card, score: scoreCard(card, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(item => item.card);
}
```

### 不需要改 route.ts

再强调一遍：`src/app/api/chat/route.ts` 的检索调用已经接好了，你什么都不用改。只要 `knowledge.ts` 的 `retrieveKnowledge` 有真实内容，它就能工作。

### 怎么跑、怎么验证

1. 替换 `knowledge.ts` 的内容（用上面完整的代码）。
2. `npm run dev` 启动开发服务器。
3. 进入聊天界面，说一句测试话术，例如："我最近一直睡不好，躺下来脑子就停不下来"。
4. 在终端或浏览器的 Network 请求里，或者在 `buildCounselorSystemPrompt` 的输出里（可以临时加 `console.log(systemPrompt)` 打印），看【可参考的心理支持知识】那一节是否引用了"入睡困难与睡前焦虑"这张卡。

如果看到类似这样的输出，说明检索工作了：

```
【可参考的心理支持知识】
知识卡 1：入睡困难与睡前焦虑
要点：入睡困难通常与"睡前过度激活"有关……
回应建议：先共情睡眠困扰带来的疲惫感……
```

### 安全提醒（请务必认真读）

这个知识库里的内容，会**直接变成模型对脆弱来访者说话的依据**。一张措辞不当的卡，可能对正处于危机中的人造成伤害。

必须遵守的流程：

- 所有知识卡上线前，必须经过具有临床资质的团队成员（督导或持证咨询师）逐卡评审和签字。
- 示例卡的注释里已标注"待临床签字"——不要删掉这个标注，直到真的完成评审。
- 不要在知识卡里写具体的药物名称、剂量、诊断标签（"你可能患有……"之类的表述）。
- 危机处置的知识卡（如自杀意念应对）需要更严格的临床审核，并和你们现有的 `safety.ts`、`crisis-llm.ts` 流程一起联合测试。
- 你们已经有 `safety-*.test.ts` 系列测试和 safety-CI，新的知识卡内容应该也纳入这些测试覆盖（比如：注入某张卡后，模型面对危机来访者的回应是否仍然符合安全规范）。

---

## 第三部分·CodeNexus 实战（向量版，Supabase pgvector）

### 整体思路

CodeNexus 的 AI 助教 system prompt 里有这一节：

```
【本机记忆摘要】
${assistantMemorySummary?.trim() || '暂无可用记忆；只根据当前代码和对话回答。'}
```

现在 `assistantMemorySummary` 是从客户端传进来的字段（目前可能只有用户的历史对话摘要）。我们的目标是：在服务端，用用户的问题去向量知识库检索相关内容，把检索结果也注入到这里（或者在 system prompt 里单独加一节【课程知识参考】）。

整个流程：准备讲义素材 → 建 pgvector 表 → 写入脚本（切片 + Embedding + 插入）→ 查询函数（Embedding + SQL 相似度查询）→ 在 route.ts 里注入。

### 准备素材

把你们的课程讲义、常见报错案例整理成 `.md` 文件，放在 `frontend/scripts/knowledge-source/` 目录里（自己建个目录，不影响正式代码）：

```
frontend/scripts/knowledge-source/
  python-basics-for-loop.md
  python-basics-functions.md
  common-errors-indentation.md
  common-errors-name-not-defined.md
  level-01-intro.md
  ...
```

每个文件大约 300–600 字，一个主题一个文件。

### 建表 SQL：在 Supabase 里开启 pgvector

进入你的 Supabase 项目 → SQL Editor，依次执行下面的 SQL。把这个存成 `supabase/migrations/008_knowledge_base.sql`，和现有迁移文件对齐：

```sql
-- 008_knowledge_base.sql
-- CodeNexus AI 助教知识库（向量版）

-- 开启 pgvector 扩展（如果还没开的话）
CREATE EXTENSION IF NOT EXISTS vector;

-- 知识块表
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id          BIGSERIAL PRIMARY KEY,
  -- 来源文件名，方便追溯
  source      TEXT NOT NULL,
  -- 内容标题（可选，方便人工检查）
  title       TEXT,
  -- 实际文本内容（会被放进 prompt）
  content     TEXT NOT NULL,
  -- 标签，用于过滤（可选，比如只查 Python 相关的）
  tags        TEXT[] DEFAULT '{}',
  -- OpenAI text-embedding-3-small 的维度是 1536
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pgvector 的 IVFFlat 索引，加速相似度查询
-- lists 参数建议约等于 sqrt(总行数)，几百行用 20 就够了
-- 注意：索引在插入数据后建效率更高，或者先建再插也行
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 20);

-- RLS：知识库是只读的公共资源，允许登录用户查询
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read knowledge"
  ON public.knowledge_chunks
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 只有服务角色（service_role，即你的后端 API）可以写入
CREATE POLICY "Service role can insert knowledge"
  ON public.knowledge_chunks
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- 相似度查询函数（给 Supabase RPC 调用）
-- 输入：查询向量 + 返回数量 + 相似度阈值
-- 输出：最相关的 knowledge_chunks 行
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(1536),
  match_count     INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.72
)
RETURNS TABLE (
  id        BIGINT,
  source    TEXT,
  title     TEXT,
  content   TEXT,
  tags      TEXT[],
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kc.id,
    kc.source,
    kc.title,
    kc.content,
    kc.tags,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) >= match_threshold
  ORDER BY kc.embedding <=> query_embedding  -- 按距离升序 = 按相似度降序
  LIMIT match_count;
$$;
```

说明：`<=>` 是 pgvector 的余弦距离运算符（值越小越相似），`1 - (embedding <=> query_embedding)` 转成余弦相似度（值越大越相似）。

### 写入脚本（Node.js）

在 `frontend/scripts/` 下新建 `ingest-knowledge.mjs`（用 .mjs 是为了直接用 ESM import，不用配 TypeScript）：

```javascript
// frontend/scripts/ingest-knowledge.mjs
//
// 用法：
//   node scripts/ingest-knowledge.mjs
//
// 依赖：
//   - SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 环境变量（注意是 service_role，不是 anon key）
//   - OPENAI_API_KEY 环境变量
//
// 这个脚本做三件事：
//   1. 读取 scripts/knowledge-source/ 下的所有 .md 文件
//   2. 切片（按文件，一个文件一块；也可以改成按标题切）
//   3. 对每块调用 OpenAI Embedding API 得到向量
//   4. 把内容 + 向量插入 Supabase 的 knowledge_chunks 表

import { readdir, readFile } from 'fs/promises'
import { join, basename } from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// ── 配置 ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error('缺少环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY')
  process.exit(1)
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const SOURCE_DIR = join(process.cwd(), 'scripts', 'knowledge-source')
const EMBEDDING_MODEL = 'text-embedding-3-small'
// 每次批量请求 Embedding 的块数（避免单次 API 请求太大）
const BATCH_SIZE = 10
// 两次请求之间的间隔（毫秒），避免触发 OpenAI 速率限制
const DELAY_MS = 200

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 把一个 .md 文件按一级标题（# 或 ##）切成多块。
 * 如果文件没有标题，整个文件作为一块。
 */
function splitByHeadings(text, filename) {
  const lines = text.split('\n')
  const chunks = []
  let currentTitle = basename(filename, '.md')
  let currentLines = []

  for (const line of lines) {
    if (line.match(/^#{1,2}\s+/)) {
      // 遇到标题，先保存前一块（如果有内容的话）
      const content = currentLines.join('\n').trim()
      if (content.length > 20) {
        chunks.push({ title: currentTitle, content })
      }
      currentTitle = line.replace(/^#{1,2}\s+/, '').trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  // 最后一块
  const content = currentLines.join('\n').trim()
  if (content.length > 20) {
    chunks.push({ title: currentTitle, content })
  }

  return chunks
}

/**
 * 调用 OpenAI Embedding API，批量处理（每次最多 BATCH_SIZE 条）。
 * 返回每条文本对应的向量数组。
 */
async function getEmbeddings(texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  // 按 index 排序，确保顺序对应
  return response.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding)
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  // 1. 读取所有 .md 文件
  const files = (await readdir(SOURCE_DIR)).filter(f => f.endsWith('.md'))
  console.log(`找到 ${files.length} 个知识文件`)

  // 2. 切片
  const allChunks = []
  for (const file of files) {
    const text = await readFile(join(SOURCE_DIR, file), 'utf-8')
    const chunks = splitByHeadings(text, file)
    for (const chunk of chunks) {
      allChunks.push({
        source: file,
        title: chunk.title,
        content: chunk.content,
        // 从文件名提取 tags，规则：文件名里有 python 就加 python 标签，以此类推
        tags: extractTagsFromFilename(file),
      })
    }
    console.log(`  ${file}：切出 ${chunks.length} 块`)
  }
  console.log(`共 ${allChunks.length} 块，开始生成向量……`)

  // 3. 分批调用 Embedding API
  const results = [] // { source, title, content, tags, embedding }[]

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE)
    const texts = batch.map(c => `${c.title}\n\n${c.content}`)  // 标题 + 内容一起 embed
    const embeddings = await getEmbeddings(texts)

    for (let j = 0; j < batch.length; j++) {
      results.push({ ...batch[j], embedding: embeddings[j] })
    }

    process.stdout.write(`\r已处理 ${Math.min(i + BATCH_SIZE, allChunks.length)}/${allChunks.length} 块`)
    if (i + BATCH_SIZE < allChunks.length) await sleep(DELAY_MS)
  }
  console.log('\n向量生成完毕，开始写入 Supabase……')

  // 4. 插入 Supabase（先清空旧数据，再全量写入）
  // 注意：如果知识库很大，建议改成按 source 增量更新
  const { error: deleteError } = await supabase
    .from('knowledge_chunks')
    .delete()
    .not('id', 'is', null)  // 删除所有行

  if (deleteError) {
    console.error('清空旧数据时出错：', deleteError)
    process.exit(1)
  }

  // 分批插入（Supabase 的 insert 每次建议不超过 1000 行）
  for (let i = 0; i < results.length; i += 100) {
    const batch = results.slice(i, i + 100)
    const { error } = await supabase.from('knowledge_chunks').insert(batch)
    if (error) {
      console.error(`插入第 ${i}–${i + 100} 行时出错：`, error)
      process.exit(1)
    }
  }

  console.log(`✓ 写入完成，共 ${results.length} 块知识`)
}

function extractTagsFromFilename(filename) {
  const tags = []
  if (filename.includes('python')) tags.push('python')
  if (filename.includes('javascript') || filename.includes('js')) tags.push('javascript')
  if (filename.includes('error') || filename.includes('errors')) tags.push('errors')
  if (filename.includes('level')) tags.push('level')
  return tags
}

main().catch(err => {
  console.error('出错了：', err)
  process.exit(1)
})
```

运行方式：

```bash
cd frontend
SUPABASE_URL=https://你的项目.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
OPENAI_API_KEY=sk-... \
node scripts/ingest-knowledge.mjs
```

注意：用 `SUPABASE_SERVICE_ROLE_KEY`（服务角色密钥），不是 `SUPABASE_ANON_KEY`。服务角色密钥可以绕过 RLS，用于后台数据写入。不要在客户端代码里暴露它。

### 在 route.ts 里添加检索和注入

现在修改 `frontend/src/app/api/chat/route.ts`，在 `POST` 函数里，调用大模型之前，加上知识检索的逻辑：

找到文件里创建 stream 之前的位置（在 `let stream` 那行之前），添加以下代码：

```typescript
// 在 route.ts 顶部引入（如果还没有的话）
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

// ── 在 POST 函数里，构建 system prompt 之前 ────────────────────────────────

// 用用户最新一条消息 + 代码内容构造检索 query
// 如果消息为空就跳过检索
const latestUserMsg = Array.isArray(messages) && messages.length > 0
  ? messages[messages.length - 1]?.content ?? ''
  : ''

let knowledgeContext = ''

if (latestUserMsg.trim().length > 0) {
  try {
    // 1. 把 query 转成向量
    const openaiForEmbedding = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? byoKey ?? ''
    })
    const embeddingResp = await openaiForEmbedding.embeddings.create({
      model: 'text-embedding-3-small',
      input: `${latestUserMsg}\n${code ?? ''}`.slice(0, 2000)  // 限制长度
    })
    const queryVector = embeddingResp.data[0].embedding

    // 2. 调用 Supabase RPC 查询相似内容
    const supabaseForKnowledge = await createClient()
    const { data: chunks, error: rpcError } = await supabaseForKnowledge.rpc(
      'match_knowledge',
      {
        query_embedding: queryVector,
        match_count: 4,
        match_threshold: 0.72
      }
    )

    if (!rpcError && chunks && chunks.length > 0) {
      // 3. 格式化成文字，准备注入 prompt
      knowledgeContext = chunks
        .map((chunk: { title: string; content: string; similarity: number }, i: number) =>
          `参考资料 ${i + 1}（${chunk.title}）：\n${chunk.content}`
        )
        .join('\n\n---\n\n')
    }
  } catch (err) {
    // 检索失败不影响主流程，静默处理
    console.error('knowledge retrieval error:', err)
  }
}
```

然后在 `systemPrompt()` 的调用里，把 `knowledgeContext` 传进去。在现有的 `systemPrompt({ ... })` 调用里加一个参数（同时你需要修改 `systemPrompt` 函数签名来接受它）：

在 `systemPrompt` 函数里（大约在"本机记忆摘要"那一节附近）加一节：

```typescript
// 在 systemPrompt 函数的参数里加
function systemPrompt({
  // ... 现有参数 ...
  knowledgeContext,  // 新增
}: {
  // ... 现有类型 ...
  knowledgeContext?: string  // 新增
}) {
  // ... 函数体里，在"本机记忆摘要"那节后面加 ...

  const knowledgeSection = knowledgeContext?.trim()
    ? `\n\n【课程知识参考（优先依据这些资料回答编程问题，没有相关内容时用通用知识）】\n${knowledgeContext}`
    : ''

  // 然后在 return 的字符串里加上 knowledgeSection
  return `...现有内容...${knowledgeSection}`
}
```

### 怎么跑

1. 先在 Supabase SQL Editor 跑 `008_knowledge_base.sql`，建好表和函数。
2. 把课程讲义放进 `scripts/knowledge-source/`。
3. 跑 `ingest-knowledge.mjs` 写入知识库。
4. 修改 `route.ts`（加检索逻辑 + 注入到 system prompt）。
5. `npm run dev`，测试 AI 助教能否基于你的讲义回答。

**验证方法**：问一个你的讲义里有的问题（比如某个关卡的特定问法），看回答是否引用了你写的讲义内容，而不是通用知识。

---

## 第四部分·agent-starter 实战（Agentic RAG）

### 和"塞 prompt"式 RAG 的区别

前两种方式（心理医生的关键词版、CodeNexus 的向量版）都是在每次请求前强制检索、强制注入。不管用户问什么，都先查一遍知识库，把结果塞进 prompt。

Agentic RAG 的思路不同：**把知识检索做成一个工具，让 agent 自己决定什么时候用**。

- 用户问"帮我读一下这个目录有哪些文件"——agent 知道应该用 `list_dir`，不需要查知识库。
- 用户问"Python 里的 for 循环怎么写"——agent 判断"这是语法问题，我查一下知识库"，调用 `search_knowledge` 工具，然后基于检索结果回答。

这样做的好处：
- 避免每次都浪费 token 把不相关的知识塞进 prompt。
- agent 对"我什么时候需要查资料"有自己的判断，更灵活。
- 和其他工具（`read_file`、`list_dir` 等）并列存在，agent 可以组合使用。

### 在 tools.py 里加 search_knowledge 工具

打开 `/Users/allenli/Desktop/编程工坊/agent-starter/tools.py`，在现有代码末尾（`TOOL_FUNCTIONS` 字典和 `run_tool` 函数之前）加上以下内容：

```python
# ────────────────────────────────────────────────────────────────────────────
# 工具 4：检索知识库
# 这是 Agentic RAG 的核心：一个让 agent 自己决定何时调用的检索工具。
#
# 这里用最简单的关键词版实现——和心理医生那边逻辑一样，
# 但用 Python 写，并且面向编程知识（Python 语法、报错、讲义等）。
#
# 知识库数据：直接用 Python 字典列表，零依赖。
# 你可以把这里的 KNOWLEDGE_BASE 换成从文件读取，或者换成调用向量数据库 API。
# ────────────────────────────────────────────────────────────────────────────

KNOWLEDGE_BASE = [
    {
        "id": "python-for-loop",
        "title": "Python for 循环基础",
        "keywords": ["for循环", "for loop", "遍历", "迭代", "range", "列表遍历", "in"],
        "content": """Python 的 for 循环用于遍历一个序列（列表、字符串、range 等）。

基本语法：
    for 变量 in 序列:
        执行体（注意缩进）

常见用法：
    # 遍历列表
    fruits = ["苹果", "香蕉", "橙子"]
    for fruit in fruits:
        print(fruit)

    # 用 range 循环 N 次
    for i in range(5):   # i 从 0 到 4
        print(i)

    # range(start, stop, step)
    for i in range(0, 10, 2):  # 0, 2, 4, 6, 8
        print(i)

常见错误：缩进不一致会报 IndentationError；range() 不包含末尾值（range(5) 是 0-4，不包含 5）。"""
    },
    {
        "id": "python-indentation-error",
        "title": "IndentationError 缩进错误",
        "keywords": ["IndentationError", "缩进", "indentation", "indent", "tab", "空格", "unexpected indent"],
        "content": """IndentationError 是 Python 最常见的语法错误，意思是"缩进出了问题"。

报错示例：
    IndentationError: expected an indented block
    IndentationError: unexpected indent

原因和修复：
    1. 忘记缩进：if/for/def/while 后面的代码块必须缩进
       错误：
           if True:
           print("hello")   # 没缩进！
       
       修复：
           if True:
               print("hello")  # 加 4 个空格

    2. 混用 Tab 和空格：Python 3 不允许混用，统一用 4 个空格
    
    3. 多余的缩进：在不需要缩进的地方加了空格

调试技巧：看报错信息的第一行，它会告诉你哪一行出错了。"""
    },
    {
        "id": "python-name-error",
        "title": "NameError 变量未定义",
        "keywords": ["NameError", "name is not defined", "未定义", "变量", "variable", "undefined"],
        "content": """NameError: name 'xxx' is not defined 意思是你用了一个没有被定义的变量。

常见原因：
    1. 拼写错误：定义的是 count，用的是 conut
    2. 变量在用之前还没有被赋值
    3. 变量在函数里定义，在函数外用（作用域问题）
    4. 忘记导入模块：用了 math.sqrt 但没有 import math

修复步骤：
    - 看报错里 'xxx' 是什么名字
    - 在代码里搜这个名字，看有没有拼写错误
    - 确认它在被使用前已经赋值

示例修复：
    # 错误
    print(mesage)  # 变量名拼错了
    
    # 修复
    message = "hello"
    print(message)"""
    },
    {
        "id": "python-list-basics",
        "title": "Python 列表基础操作",
        "keywords": ["列表", "list", "append", "索引", "index", "切片", "slice", "len", "remove", "pop"],
        "content": """Python 列表（list）是最常用的数据结构，用方括号 [] 创建。

基本操作：
    fruits = ["苹果", "香蕉", "橙子"]
    
    # 访问元素（索引从 0 开始）
    fruits[0]    # "苹果"
    fruits[-1]   # "橙子"（最后一个）
    
    # 切片
    fruits[0:2]  # ["苹果", "香蕉"]（不包含 index 2）
    
    # 添加元素
    fruits.append("葡萄")      # 加到末尾
    fruits.insert(1, "梨")    # 插入到 index 1
    
    # 删除元素
    fruits.remove("香蕉")     # 按值删除（找不到会报错）
    fruits.pop()              # 删除并返回最后一个
    fruits.pop(0)             # 删除并返回 index 0
    
    # 长度
    len(fruits)               # 列表元素个数

常见错误：IndexError: list index out of range 表示访问了不存在的索引，检查 index 是否在 0 到 len(list)-1 范围内。"""
    },
]


def _tokenize_simple(text: str) -> set:
    """简单分词：转小写，按非字母数字汉字字符切分，返回词集合。"""
    import re
    tokens = re.split(r'[\s，。！？、；：""''【】（）…\-_,./\\|+*&#@!?;:\'"()\[\]{}]+', text.lower())
    return {t for t in tokens if len(t) >= 1}


def search_knowledge(query: str, limit: int = 3) -> str:
    """
    在内置知识库里检索与 query 最相关的内容块。
    
    打分逻辑：
    - keywords 命中：每个词权重 1.0，直接子串命中额外 +0.15
    - title 词命中：权重 0.8
    - 按加权得分排序，返回前 limit 个，得分为 0 的过滤掉
    
    返回格式化的字符串，直接可以放进 agent 的上下文。
    """
    if not query or not query.strip():
        return "（查询为空，没有检索结果）"

    query_lower = query.lower()
    query_tokens = _tokenize_simple(query)

    scored = []
    for item in KNOWLEDGE_BASE:
        weighted_hits = 0.0
        max_weight = 0.0

        # keywords 打分
        for kw in item.get("keywords", []):
            kw_lower = kw.lower()
            max_weight += 1.0
            if kw_lower in query_tokens or kw_lower in query_lower:
                weighted_hits += 1.0
                if len(kw_lower) >= 2 and kw_lower in query_lower:
                    weighted_hits += 0.15

        # title 词打分
        import re
        title_words = _tokenize_simple(item.get("title", ""))
        for w in title_words:
            max_weight += 0.8
            if w in query_tokens or w in query_lower:
                weighted_hits += 0.8

        score = min(1.0, weighted_hits / max_weight) if max_weight > 0 else 0.0
        if score > 0:
            scored.append((score, item))

    if not scored:
        return "（没有找到相关知识，请根据编程知识直接回答）"

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:limit]

    lines = [f"找到 {len(top)} 条相关知识：\n"]
    for i, (score, item) in enumerate(top, 1):
        lines.append(f"【知识 {i}】{item['title']}（相关度 {score:.2f}）")
        lines.append(item["content"])
        lines.append("")

    return "\n".join(lines)
```

然后找到 `TOOLS` 列表，在末尾加上这个工具的 schema（在 `# 第三阶段在这里加 fetch_api 的说明书` 注释之前）：

```python
    {
        "name": "search_knowledge",
        "description": (
            "在编程知识库里搜索和 query 相关的内容，包括 Python 语法、常见报错的解释和修复方法、代码示例等。"
            "当用户问到具体的编程知识、遇到报错不知道怎么解决时，用这个工具先查一下知识库，再给出回答。"
            "不需要查的时候（比如只是读文件、列目录这类操作性任务）就不要用。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "检索查询，用用户的问题或报错信息作为 query，比如 'IndentationError 怎么修复' 或 'for 循环怎么写'"
                },
                "limit": {
                    "type": "integer",
                    "description": "返回的最大结果数，默认 3",
                }
            },
            "required": ["query"],
        },
    },
```

再在 `TOOL_FUNCTIONS` 字典里加上映射：

```python
TOOL_FUNCTIONS = {
    "read_file": read_file,
    "list_dir": list_dir,
    "fill_template": fill_template,
    "search_knowledge": search_knowledge,   # 新增这行
}
```

最后，在 `mini_agent.py` 的 `SYSTEM_PROMPT` 里，告诉 agent 有这个新工具：

```python
SYSTEM_PROMPT = (
    "你是一个干活利落的助手 agent。"
    "你有一组工具可以用：需要看文件就用 read_file，需要看目录就用 list_dir，"
    "需要套模板生成内容就用 fill_template，"
    "遇到 Python 语法问题、报错或不确定的编程知识时，先用 search_knowledge 查一下知识库再回答。"  # 新增
    "先想清楚要不要用工具，能一步到位就别绕弯。完成后用简洁中文给出结果。"
)
```

### 测试一下

```bash
cd /Users/allenli/Desktop/编程工坊/agent-starter
export ANTHROPIC_API_KEY=你的key
python mini_agent.py "我写了一个 for 循环，运行报 IndentationError，怎么修？"
```

你会看到 agent 先调用 `search_knowledge("IndentationError 修复")`，得到知识库里的内容，然后再基于这些内容给出具体建议。

---

## 第五部分·关键词版 vs 向量版怎么选 + 升级路线 + 评估 + 常见坑

### 怎么选

用这个决策树：

```
知识库内容是你自己写的、领域专一、已经知道用户会用哪些词？
    ↓ 是
关键词版（心理医生 / agent-starter 的方式）
更快落地，零依赖，今天就能跑

用户表达多变、用不同的词说同一个意思、需要语义理解？
    ↓ 是
向量版（CodeNexus 的方式）
需要 Embedding API + 向量存储，但检索精度更高

知识库超过 1 万条、需要支持多语言混合、需要实时更新？
    ↓ 是
向量版 + 专用向量数据库（Pinecone / Weaviate）
这时候 pgvector 的性能可能不够用
```

对你目前的三个项目：
- 心理医生：关键词版就够，主诉关键词是有限集合，控制和审计都更方便。
- CodeNexus：向量版，编程问题的表达方式太多了（"for循环怎么用"、"怎么遍历列表"、"iterate through a list" 都是同一个问题）。
- agent-starter：关键词版，规模小，需求也简单，先跑通再说。

### 从关键词版平滑升级到向量版

如果你在心理医生这边先跑了关键词版，之后想升级到向量版：

1. 知识卡结构不变（`KnowledgeCard` 类型不用改）。
2. 新建一个 `retrieveKnowledgeVector` 函数，和现有 `retrieveKnowledge` 并列。
3. 在 `knowledge.ts` 里切换调用：把 `retrieveKnowledge` 改成调用向量版实现。
4. `route.ts` 完全不用动，因为函数签名没有变（同样是 `(query: string, limit: number) => KnowledgeCard[]`）。
5. 升级的步骤：写入时给每张卡生成 embedding 存在侧表 → 检索时用向量距离而不是关键词匹配 → 检索到的卡 id 再去拿完整的 `KnowledgeCard` 对象。

### 怎么评估检索好不好

不要靠感觉，要建一个小测试集。具体做法：

1. 准备 10–20 个"测试问题"，涵盖你知识库里每个主题。每个问题标注"期望命中的卡片 id"。

```typescript
// 例子：
const testCases = [
  { query: "我总是睡不着，脑子一直在转", expectedIds: ["sleep-001"] },
  { query: "我觉得自己什么都做不好", expectedIds: ["cbt-auto-thoughts-001"] },
  { query: "跟男朋友吵架了不知道要不要说", expectedIds: ["interpersonal-001"] },
]
```

2. 跑检索，看命中率：

```typescript
let hits = 0
for (const tc of testCases) {
  const results = retrieveKnowledge(tc.query, 4)
  const resultIds = results.map(c => c.id)
  const hit = tc.expectedIds.some(id => resultIds.includes(id))
  if (hit) hits++
  else console.log("未命中：", tc.query, "→ 返回了", resultIds)
}
console.log(`命中率：${hits}/${testCases.length}`)
```

3. 对未命中的，检查原因：是关键词不够？还是用户说法覆盖不到？然后补充关键词或新增卡片。

4. top-k 命中率（Hit@k）：目标是 top-3 里至少有 1 个期望卡。命中率 < 70% 说明需要优化关键词或调整分词逻辑；< 50% 说明关键词严重不足，需要大量扩充。

5. 人工抽查：每次上线前，让临床团队或助教实际对话几轮，看引用的知识卡是否确实恰当。自动化指标只是辅助，人眼判断是最终标准。

### 常见坑

**坑 1：块切太大**

把整个章节（2000+ 字）作为一块。结果：检索时这块的相似度被稀释，命中率低；注入后 token 消耗过多，影响模型对知识的利用效率。修复：细切，一个知识点一块，300–600 字是合理区间。

**坑 2：关键词太窄，只有专业词没有口语**

关键词只写 `["认知重构", "自动思维"]`，用户说的是"我总是觉得自己很差"。没有命中。修复：每张卡都要加口语同义词、症状描述词，站在用户的角度想他们会怎么说。

**坑 3：忘了去重**

知识库里有两张内容几乎相同的卡（比如 sleep-001 和 sleep-002 都讲失眠，只是措辞略有不同）。检索时两张都命中，占了两个 top-k 的位置，挤掉了其他主题的卡。修复：建库时做去重检查；同一主题只保留最好的一张卡。

**坑 4：top-k 设太大**

把 limit 设成 10，每块 500 字，10 块就是 5000 字。加上 system prompt 的其他内容，很容易超 context window，或者让模型"读"了太多不相关的内容。修复：limit=3–5 通常够用；知识卡写精炼一点（200–400 字）更容易被模型利用。

**坑 5：没有约束模型只用资料**

注入了知识卡，但没有告诉模型"优先依据这些资料"。模型会把资料和自己的训练记忆混合使用，导致引用了你知识库里没有的内容（幻觉）。修复：在【可参考的心理支持知识】这节前面加："优先依据以下资料回答；资料中没有涉及的内容，请用通用方式支持，不要编造。"

**坑 6：Embedding 模型不一致**

写入时用 `text-embedding-3-small` 生成向量，检索时却用 `text-embedding-ada-002` 生成 query 向量。不同模型的向量空间不兼容，相似度计算会完全错误。修复：写入和检索必须用同一个 Embedding 模型，写在配置里统一管理，不要硬编码两个地方各写一个。

**坑 7：安全（仅限心理医生）**

在心理知识库里加了措辞激进的内容（比如"告诉用户他们的关系是有问题的"），或者加了专业资质类的承诺（"这种干预方法已被证明有效"）。这类内容经过 RAG 注入后，会直接影响模型面对来访者的表达。修复：所有卡片临床团队评审 + 关键词里加上不应该触发此卡的反向过滤逻辑（比如危机状态下不触发"关系表达练习"卡）。

**坑 8：知识库一次写入后从不更新**

随着平台的课程内容迭代、临床经验积累，知识库需要持续更新。如果只写入一次再也不管，知识库很快就和实际需求脱节。修复：建立更新流程（比如每次新增课程关卡后跑一遍 `ingest-knowledge.mjs`；每月临床团队审核一次知识卡内容）。

---

## 附录：快速参考

### 心理医生知识卡模板

```typescript
{
  id: "主题-序号",
  title: "简短标题",
  tags: ["大类1", "大类2"],
  keywords: ["口语词1", "口语词2", "专业词", "同义词"],
  content: `机制说明 + 常见表现 + 适用框架（150-400字）`,
  guidance: [
    "首要回应方向",
    "具体干预提示",
    "需要避免的（可选）"
  ]
}
```

### CodeNexus 知识块文件模板

```markdown
# 知识点标题

简短说明这个知识点是什么（1-2句）。

## 语法 / 核心概念

具体内容，要有代码示例。

## 常见错误

报错信息 + 原因 + 修复方法。
```

### 检索调用参考

心理医生（TypeScript）：
```typescript
// 已在 route.ts 里接好，不需要你手动调
const cards = retrieveKnowledge(queryString, 4)
```

CodeNexus（SQL RPC）：
```sql
SELECT * FROM match_knowledge(
  query_embedding := '[0.1, 0.2, ...]'::vector,
  match_count := 4,
  match_threshold := 0.72
);
```

agent-starter（Python）：
```python
# agent 会自己决定何时调，你只需要保证工具已注册到 TOOLS 和 TOOL_FUNCTIONS
result = search_knowledge("IndentationError 怎么修复", limit=3)
```

---

*本文档对齐代码版本：心理医生 recovered-2026-06-13，编程工坊 frontend package.json v0.1.0，agent-starter tools.py（三工具版）。如代码结构有变化，以实际文件为准。*
