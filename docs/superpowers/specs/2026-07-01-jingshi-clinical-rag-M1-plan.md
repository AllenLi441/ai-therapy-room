# 静室 RAG · Milestone 1 实现计划(施工蓝图)

- 日期: 2026-07-01 · 分支: `p5-clinical-rag`
- 依据: 设计 spec `2026-07-01-jingshi-clinical-rag-design.md` + omc architect 计划 + omc critic 压测(5 必改 + 2 安全护栏,均已并入)
- 栈(已定稿): 生成 = DeepSeek/Kimi API(不变);**向量化 = 托管 embedding API**(复用 `embeddings.ts` CloudEmbeddingProvider,prod 已配);**向量库 = Qdrant Cloud 免费档**(dense);重排 = 现有 SiliconFlow(快速模式跳过);web 兜底 = Tavily(已配)。**不自托管 sidecar。**

## M1 目标(走通骨架)
把现有 **17 张 approved 卡**用已配的 embedding API 算 dense 向量、写入 Qdrant;查询链路新增 **Qdrant dense 检索 tier**(在现有向量/关键词之上,全程 fail-safe);**grounded 生成**(基于检索到的真实内容,温暖口吻)+ **诚实修复**。语料扩充留 M2。

**现在可建(纯代码/配置,不加载模型、不需账号,测试全 mock 网络)** vs **用户基建后才能跑**(建 Qdrant、填 env、跑摄取、线上验证)分开列在 §施工顺序。

## 关键修正(critic,必须照此实现)
1. **诚实/grounding 提示词只在 `knowledge.length>0` 时注入**。倾诉/未命中/**危机**轮 `knowledge=[]`,绝不能让模型声称「我有资料库」→ 反向撒谎。危机回复共用 `buildCounselorSystemPrompt`,此门天然覆盖它。
2. **放开「禁引用」时保留「禁背数字」**。`QUALITY_BAR`(prompts.ts:41)改为:仍禁学术腔(「研究表明/有研究发现/心理学认为」)、禁念链接、**禁复述统计数字/效应量/样本量**(卡里有「3.32 亿」「g=1.18」),但允许把事实用安屿自己的话自然说出。
3. **prompt 改动不随「休眠代码」裸奔上线**。检索代码没配 env 前是死的(安全);但 prompts.ts 一改、推 main 即对用户生效。**全部改动留 `p5` 分支,先过 jingshi-eval + 人工验语气,再合并 main**;合并时 **bump APP_VERSION**。
4. **不臆断旧 Tier-2 失效,按防御式设计**。prod 6/27 的 `EMBEDDING_*` 可能是活的 SiliconFlow(且 rerank 复用它)——**不动它**;靠 §5 的硬超时消除「stale 端点拖死」风险。
5. **快速模式(≤6s)给检索硬超时**。Tier-1 = embed(API)+ Qdrant 两次跨境往返;**快速模式跳过重排 + Tier-1 总墙钟设 ~2.5s,超时立刻退回关键词**。深度模式可放宽。

**安全护栏(补测)**:① 危机轮(knowledge 空)断言**拿不到** grounding/诚实那几句、且危机安全措辞不变;② 明确指令**事实不得表述为诊断阈值**(「持续两周以上就是抑郁」这类禁止)。

## 新增文件
- `src/lib/qdrant.ts` — fail-safe Qdrant dense 检索客户端。`qdrantDenseSearch(vector:number[], opts:{limit;lang?;trustTier?}): Promise<KnowledgeCard[]|null>`。读 `QDRANT_URL/QDRANT_API_KEY/QDRANT_COLLECTION`(header `api-key`)。POST `/collections/{col}/points/query`,`filter.must` **恒含 `{key:'clinicalStatus',match:{value:'approved'}}`**(+ 传入的 lang/trustTier)。payload→KnowledgeCard 映射保留 `sourceUrl/sourceQuote/sourceTitle`(面板 refs 不变)。缺 env/非 2xx/超时/异常 → `null`,**绝不 throw**。
- `src/lib/qdrant.test.ts` — mock fetch:缺 env→null;happy path 断言请求体 filter 含 approved、payload 映射保留来源三件套;lang/trustTier 传入即入 filter;非 ok→null;throw→null。
- `scripts/ingest/upsert-cards.mjs` — 读 `KNOWLEDGE_CARDS` 过滤 `clinicalStatus==='approved'`(17);`ensureCollection`(dense size=模型维度, Cosine);逐卡用**已配 embedding API** 算 dense(复用 build-knowledge-embeddings 的调用方式)→ upsert point{id, vector, payload:{...卡字段, lang:'zh', trustTier:'authoritative', sourceId:id, chunkPath:title, clinicalStatus:'approved'}};写 `src/lib/knowledge-chunk-snapshot.generated.json`(可 diff 审计)。**拒绝写非 approved**。env 经 `!`/本地 `.env.local`,助手不碰 key。
- `scripts/ingest/README.md` — 记录 M2 全管线阶段(fetch→clean→chunk→出处→逐字校验→embed→分级信任→入库)+ M1 只跑 upsert-cards。
- `docs/rag-m1-runbook.md` — 用户照做:建 Qdrant 免费集群→填 Vercel `QDRANT_*`→确认/rotate `EMBEDDING_API_KEY`→本地 `.env.local` 同步→`node scripts/ingest/upsert-cards.mjs`→提交 snapshot→合并前过 eval→线上验证(spec §7.1)。含「改了卡内容须重跑 upsert 防 TS↔Qdrant 漂移」提醒。

## 修改文件(外科手术)
- `src/lib/types.ts` — `KnowledgeCard` 加可选 `lang?:'zh'|'en'; trustTier?:'authoritative'|'research'; sourceId?; chunkPath?`;`clinicalStatus` 加 `'pending'`。全可选,现有 17 卡与所有测试不受影响。
- `src/lib/knowledge.ts` — `retrieveKnowledge` 内、现有向量路径**之上**加 Tier-1:`vec = await embedQuery(q)`(复用现有 provider,null-safe)→ `qdrantDenseSearch(vec,{limit})`;非空则(深度模式)`rerankCards` 复用、快速模式跳过;null/空 → 落到现有向量→关键词。**保留** isInfoSeeking 门、外层 try/catch fail-safe `[]`、`approvedCards()`。加 `fastMode`/超时参数(见修正 5),由 route.ts 传入。
- `src/lib/prompts.ts` — (1) `QUALITY_BAR`:31→按修正 2 改写(禁学术腔/念链接/背数字,允许自述事实);(2) `formatKnowledge`:保留 title/content/guidance,**每卡加一行 `真实来源：{sourceTitle}`**(不注入 url/quote,面板专用);(3) `buildCounselorSystemPrompt`:**仅当 knowledge 非空**加 grounding 框架 + 诚实句(「被问来源时如实说参考了可查证资料,别否认/别说瞎编」)+ 事实不得当诊断阈值。**不动** `PROFESSIONAL_BOUNDARY`(19-20)。
- `src/app/api/chat/route.ts` — 给 `retrieveKnowledge` 调用传 `fastMode` + 超时;不改危机分支顺序(检索仍在所有危机/自杀/边界分支返回**之后**)。
- `.env.example` — 加 `QDRANT_URL/QDRANT_API_KEY/QDRANT_COLLECTION` 块 + 「勿把 `EMBEDDING_BASE_URL` 改指别处(rerank 复用)」警告。
- `src/lib/knowledge.test.ts` / `prompts.test.ts` / `src/app/api/chat/route.test.ts` — 见测试计划。

## 测试计划(全 mock,不加载模型;`npm test` 单进程)
- qdrant.test.ts:见上(含 approved-only 断言)。
- knowledge.test.ts:mock qdrant+embed provider → Tier-1 命中返回映射卡(带 source 三件套);qdrant→null 退回关键词(现有行为);两者 throw → 仍 resolve 成数组(fail-safe []);**快速模式不调用 rerank**。
- prompts.test.ts:knowledge 非空 → 含 content + `真实来源` + 诚实句 + 「用自己的话」;**knowledge 空 → 不含** grounding/诚实句(护栏①);回归:仍禁「研究表明」;新增断言**禁数字复述**指令存在;无「否认来源」指令。
- route.test.ts:危机轮 → retrieveKnowledge/embed/qdrant/searchAuthoritative **均不调用**;危机+深度 → 不 web 搜;非危机 info-seeking 深度且 retrieveKnowledge 返回 [] → **调用** searchAuthoritative(兜底保留)。保留全部现有分支顺序测试。

## 施工顺序(executor;不并行重进程)
1. types.ts 扩字段(全可选)。
2. 新增 qdrant.ts + qdrant.test.ts。
3. knowledge.ts 插 Tier-1(+ fastMode/超时)+ knowledge.test.ts。
4. route.ts 传 fastMode/超时 + route.test.ts 安全回归。
5. **【分开一提交、可独立 hold/回滚】** prompts.ts grounding+诚实(带修正 1/2 + 护栏)+ prompts.test.ts。
6. scripts/ingest/upsert-cards.mjs + snapshot 格式 + README;.env.example;docs/rag-m1-runbook.md。
7. 一次验证:先 `npm test`(vitest run),需要再单独 `npm run build`。绝不并行 build+test+dev。
8. 【用户,基建】建 Qdrant、填 Vercel env、`.env.local` 同步、跑 upsert-cards、提交 snapshot。
9. 【合并前】过 jingshi-eval + 人工验语气(尤其无科普腔/无诊断腔)→ bump APP_VERSION → 合并 main(prompt 改动不裸奔)。

## 安全不变量(全保留,附证明测试)
真 URL+逐字引用(payload 映射不变,qdrant.test 断言)· 检索永在危机分支之后且 fail-safe(route.test 危机不调用 + knowledge.test throw→数组)· 危机永不 web 搜(route.test)· 仅 approved 可检索(qdrant filter + upsert 只写 approved,qdrant.test 断言)· 不碰 safety.ts/implicit-risk.ts · 事实不当诊断阈值(prompts 指令 + 护栏②)· 诚实句仅在有来源时出现(护栏①)。
