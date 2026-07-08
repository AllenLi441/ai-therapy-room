# 静室评测框架(阶段 1:目录骨架 + 适配层)

这是一个独立于生产代码的评测套件,用于系统性评估 `src/lib/safety.ts`(词表)、
`src/lib/implicit-risk.ts`(LLM 判官)、`src/app/api/chat/route.ts`(全管线)、
`src/lib/knowledge.ts`(RAG 检索)四条臂的表现。**只读生产代码,零侵入** ——
不修改 `src/` 下任何文件,所有既有测试(`npx vitest run`)保持全绿。

## 与既有评测套件的关系

仓库里还有两个评测相关目录,和本套件**互不相干**:

- `evals/`(旧 therapy eval,`npm run eval:therapy`)—— 历史遗留的疗愈对话评测脚本。
- `jingshi-eval/`(CPsyCounE 45 例回放 + DeepSeek/Kimi 双判官)—— 打**生产** URL
  (`ai-therapy-room.vercel.app`)的黑盒复核工具。

本套件(`eval/`)不打生产 URL,而是通过 `POST(request: Request)` 直接调用
`src/app/api/chat/route.ts` 的导出函数,在进程内跑完整管线,不需要 dev server。

## 目录结构

```
eval/
  adapters/     # 阶段 1:四条臂的统一适配层(本次交付)
  datasets/     # 阶段 2+:safety / rag / multiturn 测试用例(占位)
  harness/      # 阶段 3+:批量跑分 + 指标聚合的执行器(占位)
  metrics/      # 阶段 3+:指标计算(准确率/延迟分布/RAG 命中率等)(占位)
  reports/      # 阶段 5+:跑分报告输出(gitignore,不提交生成产物)
  human-study/  # 阶段 6:人工复核问卷/标注产物(占位)
```

## 适配器(`eval/adapters/`)

所有适配器返回统一的 `AdapterResult`(见 `result.ts`):

```ts
export type UnifiedLabel = "none" | "passive_ideation" | "active_ideation" | "crisis";
export type Branch =
  | "normal" | "gentle_check" | "suspected" | "crisis"
  | "medication" | "diagnosis" | "medical_redflag" | "retrieval";

export type AdapterResult = {
  prediction: UnifiedLabel | string[] | null;
  confidence?: number;
  branch: Branch;
  route?: string | null;               // 全管线:决策日志的 DecisionRoute(权威)
  interventionTiming?: "blocking" | "trailing" | "none";
  tailEvent?: { type: string; status: string } | null;
  latencyMs: number;
  firstTokenMs?: number;               // 全管线:到首字节的毫秒数(RQ3 延迟收益)
  error?: string;
  raw: unknown;
};
```

### 四条臂

| 文件 | 函数 | 说明 |
| --- | --- | --- |
| `wordlist.ts` | `runWordlistOnly(input: string \| string[])` | 纯词表(`assessRisk`/`assessConversationRisk`),零网络,同步。 |
| `judge.ts` | `runJudgeOnly(input, opts?)` | 纯 LLM 判官(`assessImplicitRiskWithLLM`),需要 `KIMI_API_KEY`。 |
| `pipeline.ts` | `runFullPipeline(messages, opts)` / `runConversation(userTurns, opts)` | 全管线(直接调用 `POST`),需要 `DEEPSEEK_API_KEY`(+ 可选 `KIMI_API_KEY`)。 |
| `retrieval.ts` | `runRetrieval(query, opts)` | RAG 检索(`retrieveKnowledge`),Qdrant/embedding 未配置时自动走关键词回退,永不 throw。 |

支撑模块:`label-maps.ts`(全部标签/分支映射集中于此)、`stream-parse.ts`(拆
流式回复的事件/思考块/正文)、`decision-log-reader.ts`(决策日志游标读取,
branch 的权威来源)、`env.ts`(评测环境初始化)。

## 用法:`npm run eval:smoke`

```bash
npm run eval:smoke              # 离线段 A–E,零网络,在线段跳过
RUN_LIVE=1 npm run eval:smoke   # 额外跑在线段 F(判官)/G(全管线),各 1 条真实用例
```

- 离线段(A–E)恒跑,不需要任何 API key,验证四条臂的基本行为不 throw、分支正确。
- 在线段(F/G)仅在 `RUN_LIVE=1` **且**对应 key(`KIMI_API_KEY` / `DEEPSEEK_API_KEY`)
  存在时才跑;否则打印跳过原因,不影响退出码。
- 退出码:`0` = 全部通过,`1` = 有断言失败。

## 环境要求(`.env.local`,仓库根)

| Key | 用途 | 缺失时的行为 |
| --- | --- | --- |
| `KIMI_API_KEY` | 判官臂(`runJudgeOnly`)、全管线的隐性风险判官 | 判官返回 `not_configured`,`prediction=null` |
| `DEEPSEEK_API_KEY` | 全管线臂(`runFullPipeline`) | 全管线无法生成模型回复(词表/检索臂不受影响) |
| `QDRANT_URL` / `QDRANT_API_KEY` / `QDRANT_COLLECTION` | RAG Tier-1(Qdrant 稠密检索) | 自动降级为关键词检索,`retrieveKnowledge` 永不 throw |
| `EMBEDDING_*` | 向量检索(Qdrant 或已提交向量) | 同上,降级为关键词检索 |

## 决策日志 workdir 隔离

`setupEvalEnv()` 会把评测进程的 `cwd` 切到 `eval/.workdir/`,原因:

- 生产路由(`route.ts`)fire-and-forget 写决策日志到 `process.cwd()/logs/decisions-<date>.jsonl`。
- 研究管线 `npm run w1:harvest-logs` 读的是 **app 仓库根** 的 `logs/`,用于人工标注队列(W1)。
- 评测跑出来的全是合成样例,**绝不能**混进真实用户流量的标注队列里污染它。

所以评测产生的决策日志落在 `eval/.workdir/logs/`(已加入 `.gitignore`,不提交),
和 `app/logs/` 完全隔离。`pipeline.ts` 靠这份日志的 `route` 字段作为 branch 判定
的权威来源(游标读取,见 `decision-log-reader.ts`)。

## 串行约束

`runConversation`(多轮驱动)**只能串行跑**,不能并发:

1. 危机粘滞(crisis stickiness)是有状态的 —— 一旦某轮响应带
   `X-Crisis-Triggered: 1`,后续轮次的 `crisisModeActive` 恒为 `true`;并发跑多个
   会话会互相污染这个状态。
2. 全管线的 `latencyMs` / `firstTokenMs` 是评测的核心读数(RQ3),并发请求会让
   延迟测量失真(资源竞争、事件循环调度)。

同理,批量跑分(阶段 3 harness)也应默认串行,除非明确验证过并发跑分不影响
延迟类指标的解读。

## 阶段 2–6 预告(当前均为占位目录)

- **阶段 2**:`datasets/safety|rag|multiturn` 填充测试用例(JSON/YAML)。
- **阶段 3**:`harness/` 实现批量跑分执行器,调用本阶段的适配器。
- **阶段 4**:`metrics/` 实现指标计算(准确率、延迟分布、RAG 命中率/引用可验证性)。
- **阶段 5**:`reports/` 输出跑分报告(gitignore,不提交生成产物)。
- **阶段 6**:`human-study/` 人工复核问卷与标注产物。
