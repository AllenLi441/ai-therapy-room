# 静室 · 真·临床 RAG 后端 — 设计文档 (spec)

- 日期: 2026-07-01
- 分支: `p5-clinical-rag`
- 状态: 待用户确认 → 转 omc 规划

## 1. 背景与问题 (Context)

线上 app (ai-therapy-room.vercel.app) 目前的「RAG」体验与用户预期严重不符,用户实测时 AI 亲口否认自己有来源、说「那些网站信息是瞎编的」。经 oh-my-claudecode 多 agent 审计 (workflow `wf_b3ec0d25-03d`),确认真相是**两个割裂的子系统**:

1. **引用面板是真的**。`isInfoSeeking` 命中的问答轮,`retrieveKnowledge()` (`knowledge.ts:303`) 从 17 张手写、临床已核验卡 (`knowledge-cards.ts`) 里取 top-4,每张带真实 `sourceUrl` + 逐字 `sourceQuote`,经 `X-Knowledge` 头 (`route.ts:291/481`) 渲染成「信息来源」卡。
2. **模型看不见自己的来源,于是撒谎**。`formatKnowledge()` (`prompts.ts:66-80`) 只把 `title/content/guidance` 注入 prompt,**剥掉了 URL/quote**;叠加 `prompts.ts:41` 明令「不要引用研究/来源」。被问到来源时,模型手里没有任何 URL、又被禁止引用 → 编出「我没有资料库、我瞎编的」。
3. **检索又浅又小**。线上无 `EMBEDDING_API_KEY`,向量路径 (`embeddings.ts:184`) 关闭,退化为 **17 卡上的关键词匹配**;绝大多数问题命不中,拿不到任何真实依据。
4. **外部搜索键休眠**。`SEARCH_API_KEY` (Tavily) + 权威域名兜底 (`web-search.ts`, 从 `route.ts:434` 调用,危机轮永不触发) 代码完整,但键从未设置 → `web-search.ts:55` 静默返回 `[]`。
5. **并行分支** `p4-rag-stream2`: 26 张 draft 卡 (inert,待临床签字) + 已搭好的自托管 BGE-M3 向量化 sidecar 脚手架 (`scripts/embedding-sidecar/`, commit fe46204)。

**用户诉求**: 一个**真正的 RAG**——去权威心理学网站把真实信息拿下来、**基于真实内容生成回复**、有专业(双语)数据库 + 真实网络搜索功能。

## 2. 目标 / 非目标

**目标**
- G1 真·grounding: 检索到的权威原文内容注入 prompt,模型**基于真实内容生成回复**,而非仅展示面板。
- G2 专业双语语料: 从权威机构 (WHO/NIMH/NHS/CDC/国家卫健委等) 摄取真实心理健康科普,中英双语,每条带真实 URL + 逐字引用。
- G3 真检索: 自托管 BGE-M3 向量化 + 托管向量库 (dense+sparse 混合) + 重排,取代关键词匹配。
- G4 真网络搜索: 激活休眠的 Tavily 权威域名兜底 (仅深度、非危机、KB 未命中时)。
- G5 诚实: 模型不再否认/编造来源;被问时如实承认依托精选资料库 (保持温暖口吻)。

**非目标**
- 不做 in-text 学术引用/科普腔 (用户明确反感);grounding = 事实入话,不是逐条念链接。
- 不碰危机检测词表 (`safety.ts`/`implicit-risk.ts`) —— 语义安全层与本工作正交。
- 不纳入受版权限制、且会诱导自我诊断的内容 (DSM-5 诊断阈值排除;ICD-11 谨慎)。
- 不做用户可见的「临床评审」功能;不命名任何临床评审人。

## 3. 关键决策 (用户已拍板)

| 维度 | 决策 |
|---|---|
| 范围 | 完整临床/研究语料 + 真向量库 + **grounded 生成** |
| 语气 | 温暖不变;事实揉进安屿口吻,非科普 |
| 向量化 | **走托管 embedding API**(复用 prod 已配的 `EMBEDDING_*`,很可能是 SiliconFlow;聊天本就用 DeepSeek/Kimi API,query 再走 embedding API 无额外泄露)。~~自托管 BGE-M3~~ 已否决(常驻机成本)。 |
| 向量库 | **Qdrant Cloud 免费档**(dense 检索;语料很大时再加 sparse/混合)。无常驻机、无月租。 |
| 语料语言 | **双语** (中 + 英权威源) |
| 准入门 | **按来源分级信任**: 权威源整体授信 (仍逐字校验引用+域名白名单);研究摘要进复核队列 |
| 排期 | 一个连贯后端,内部分里程碑 (不单独发诚实修复) |

## 4. 架构

### 4.1 数据模型 (统一卡片/切块)
现有卡 schema + 新增字段:`lang` (`zh`|`en`)、`trustTier` (`authoritative`|`research`)、`sourceId` (归属来源,便于整源重爬/撤下)、`chunkPath` (heading 路径,便于溯源)。手写 17 卡原样保留 (视为 `authoritative`)。检索侧继续复用 `approvedCards()` 门 (`knowledge.ts:268`);`pending`/`draft` 永不进检索/prompt。

### 4.2 摄取管线 (离线, `scripts/ingest/`)
`来源登记表 → 抓取(尊重 robots/限速) → 清洗去噪 → 按段切块(留 heading 路径) → 附出处(URL+逐字引用+lang) → 逐字引用回验(exact-phrase 命中原页;失败则留 URL、丢引用,绝不编造 —— 沿用 knowledge-cards 头部第3-9行契约) → BGE-M3 向量化 → 分级信任定 clinicalStatus(authoritative→approved / research→pending) → 写向量库`。产物: 向量库记录 + 可 diff 的 JSON 快照 (审计/回滚)。

### 4.3 查询链路 (线上, Vercel)
`isInfoSeeking` 命中且非危机 → 调 sidecar 把 query 向量化 → 向量库**混合检索 (BGE-M3 dense + sparse)**,按 `lang/trustTier` 过滤 → 重排 (`rerank.ts` 复用) → top-k。出口: ① `sourceTitle/URL/quote` 走 `X-Knowledge` → 面板; ② **grounding**: 将 top-k 的真实 `content` + 出处摘要注入 prompt,模型据此生成 (更新 `formatKnowledge`;放宽 `prompts.ts:41` 的「禁引用」为「可用真实内容、但用自己口吻、不必念链接」)。KB 未命中且深度非危机 → Tavily 权威域名兜底。**危机轮整段绕开检索**;检索永远 fail-safe (报错返回 `[]`,不影响回复/安全)。

### 4.4 基础设施(已修订 2026-07-01:走 API,不自托管)
- **向量化**: 复用现有 `embeddings.ts` 的 `CloudEmbeddingProvider`(读 `EMBEDDING_API_KEY/MODEL/BASE_URL`,prod 6/27 已配)。dense-only。**不新建 sidecar**。
- **向量库**: **Qdrant Cloud 免费档**。dense 向量 + payload 过滤(`clinicalStatus`/`lang`/`trustTier`)。upsert 与 query 用同一 embedding 模型,维度一致即可。
- **重排**: 复用现有 `rerank.ts`(SiliconFlow,走 `EMBEDDING_BASE_URL`)。**快速模式跳过重排**。
- **Vercel env**(用户自行填,我只从 env 读): `SEARCH_API_KEY`(Tavily,已更新)、`QDRANT_URL/QDRANT_API_KEY/QDRANT_COLLECTION`;`EMBEDDING_*` 已存(需确认/rotate)。**不要**把 `EMBEDDING_BASE_URL` 改指别处——`rerank.ts` 也用它。
- 地域注意: 海外托管服务(Qdrant/embedding API)国内直连可能慢;为服务端→服务端调用,应与 Vercel 函数同区,并**给检索设硬超时**(见安全/性能:快速模式超时即退回关键词)。

## 5. 安全不变量 (全程保留)
1. 可核验来源: 真 URL + **逐字**引用,绝不 AI 转述 (卡片契约 `knowledge-cards.ts:3-9`)。
2. 检索永不越过危机/安全层: 安全底线在检索前返回 (`route.ts` crisis 出口);`retrieveKnowledge` fail-safe (`knowledge.ts:53-59, 331-334`)。
3. 危机轮永不联网搜: `!crisisModeActive` 守卫 (`route.ts:433`, `web-search.ts:9-11`) 保留。
4. 仅 `approved` 可检索 (`approvedCards`);分级信任决定 approved/pending。
5. 不碰 `safety.ts`/`implicit-risk.ts` 危机词表;不让临床参考语料泄漏诊断阈值 (反诊断边界 `prompts.ts:19-20`)。
6. 信任本身即安全: 对脆弱用户展示真来源却说「我瞎编的」会侵蚀对正规求助的信任 —— 诚实修复属安全范畴。

## 6. 凭据 / 安全操作边界
- API key 一律不硬编码、不入库、不进 spec;仅 `process.env` 读取。
- 助手**不把 key 输入任何网站表单**(含 Claude-in-Chrome 填 Vercel);由用户在 Vercel 后台自行添加。
- 用户在聊天中粘贴的 Tavily key 已暴露,**须 rotate**;本地联调如需,由用户经 `!` 命令写入 gitignored `.env.local`,助手不经手。
- Fly.io / Qdrant Cloud **账号由用户创建** (助手不建账号);助手提供精确 runbook。

## 7. 构建里程碑 (每步含验证)
1. **走通骨架 (walking skeleton)**: sidecar 上线 + Qdrant 接好 + 现有 17 卡用 BGE-M3 重算向量入库 + grounded 生成 + 诚实修复 + 激活 Tavily。
   - 验证: 提问 → 向量召回真来源且回复基于其内容;被问来源不再瞎编;倾诉→无来源;危机→不检索、不联网。
2. **摄取第一批双语语料**: 管线跑通,整源授信入库 (WHO 中英/NIMH/NHS/CDC/国家卫健委 心理科普)。
   - 验证: 覆盖面明显变大;抽样卡逐字引用可在原页命中;中英问句都能召回对应语言源。
3. **扩库 + 治理**: 研究摘要 (PMC OA/Cochrane 摘要) 走复核队列;重爬/引用校验;接 `~/Desktop/jingshi-eval` 评测召回质量 (precision/recall/faithfulness)。
   - 验证: 评测分不劣化,召回覆盖提升;pending→approved 流程可用。

## 8. 用户须操作的步骤 (助手无法代做) — 已修订
- ✅ rotate Tavily key + 填 `SEARCH_API_KEY`(已完成)。
- 创建 **Qdrant Cloud 免费账号**,拿 `QDRANT_URL` / `QDRANT_API_KEY`,连同 `QDRANT_COLLECTION` 填进 Vercel(值由你填,助手不碰)。
- 确认/rotate prod 的 `EMBEDDING_API_KEY`(6/27 设的,可能失效);`EMBEDDING_MODEL/BASE_URL` 保持不变(rerank 也用)。
- 上述完成后,助手负责代码 + 本地 mock 测试 + 联调校准;**不再需要 Fly.io / 自托管 sidecar**。

## 9. 开放项
- Fly.io vs Render/Railway 最终选型 (默认 Fly.io,按实测延迟/费用可调)。
- 第一批语料的具体来源清单与条数上限 (默认上表所列,规划期细化)。
- grounding 注入的 token 预算与「事实入话不念链接」的 prompt 具体措辞 (规划期定,过评测校验语气不回科普腔)。
