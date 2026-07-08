# 给 Claude Code 的批次指令:心理助手 RAG 向量化升级(2026-06-17)

> **背景**:`src/lib/knowledge.ts` 现为 2026-06-13 恢复留下的空桩,`retrieveKnowledge(query, limit=4)` 直接 `return []`。检索接缝**已经接好**:`src/app/api/chat/route.ts:250` 调 `retrieveKnowledge(...)`,结果经 `src/lib/prompts.ts` 的 `formatKnowledge` / `buildCounselorSystemPrompt` 注入系统提示(在【可参考的心理支持知识】下),再发给 DeepSeek/Kimi。也就是说**架子全在,只差真正的检索与内容**。
>
> **本批目标**:把它从"关键词空桩"升级成**真正的(向量)RAG**——可插拔 embedding(**默认云端、可无缝换本地中文模型**)、**离线预计算卡片向量 + 运行时查询向量 + 内存余弦 top-k**、**关键词兜底**(向量不可用时自动退回,绝不开天窗)。
>
> **老规矩**:匹配作者 `AllenLi441 <245363491+AllenLi441@users.noreply.github.com>`;每项给可验证证据;`tsc` / `npm run build` / `npm test` / `npm run lint` / `npm run test:ratchet` 全绿;**尽情用 subagents**;**不破坏确定性安全地板与 crisis 路径**;做不到/有取舍**直说,不造假**。

---

## 分两条流交付

- **流①(纯工程,可正常验证 → 合并上生产)**:embedding 抽象层 + 向量检索 + 关键词兜底 + 构建脚本 + 测试。**没有签字卡片时,检索退回兜底(关键词/空),行为安全、不改变危机逻辑,所以可上生产。**
- **流②(临床内容,出草案待签字,不擅自上线)**:起步知识卡内容。

---

## 流① 工程实现

### 1. Embedding 抽象层(可插拔)
- 新建 `src/lib/embeddings.ts`,定义:
  ```ts
  export interface EmbeddingProvider {
    readonly id: string;        // 如 "openai:text-embedding-3-small" / "local:bge-m3"
    readonly dim: number;
    embed(texts: string[]): Promise<number[][]>;
  }
  ```
- 实现两个后端,统一走 `fetch`(**不加新依赖**),复用 `src/lib/http.ts` 的超时/重试风格:
  - **cloud**:OpenAI 兼容 `POST {EMBEDDING_BASE_URL}/embeddings`,body `{ model, input, dimensions? }`,header `Authorization: Bearer {EMBEDDING_API_KEY}`。默认 OpenAI `text-embedding-3-small`;**只改 env 即可指向智谱/通义/任意 OpenAI 兼容向量端点**。
  - **local**:同一 `fetch` 路径,约定极简协议 `POST {EMBEDDING_BASE_URL}` body `{ input: string[] }` → `{ embeddings: number[][] }`,便于以后接一个 Python(sentence-transformers / **BGE-m3**)边车;来访者文本不出自有服务器。
- 工厂 `getEmbeddingProvider(): EmbeddingProvider | null`,按 `EMBEDDING_PROVIDER=cloud|local`(默认 `cloud`)选择;**缺 key / 未配置 / 构造失败 → 返回 `null`**(触发关键词兜底)。
- 把 `EMBEDDING_*` 加进 `.env.example`,注明:**云端模式查询文本会发给该向量服务;本地模式不出服务器**。变量:`EMBEDDING_PROVIDER`、`EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL`、`EMBEDDING_DIM`、`RAG_MIN_SCORE`。

### 2. 知识卡数据与向量分离(便于人读评审)
- 卡片内容 → 可人读、可评审的 `src/lib/knowledge-cards.ts`,导出 `KnowledgeCard[]`。**`KnowledgeCard` 类型保持不变**(`types.ts:127`,字段 `id/title/tags/keywords/content/guidance`,`prompts.ts` 依赖它)。
- 预计算向量 → 生成文件 `src/lib/knowledge-embeddings.generated.json`,结构 `{ providerId: string, model: string, dim: number, vectors: { [cardId]: number[] } }`,**纳入 git**(让无 key 环境/CI 也能直接用)。
- **不引入向量数据库**(卡片量小,内存余弦足够)。

### 3. 构建脚本(离线预计算)
- 新建 `scripts/build-knowledge-embeddings.mjs`:读 `knowledge-cards` → 对每张卡用**稳定拼接函数** `cardEmbedText(card) = [title, content, keywords.join(" "), tags.join(" ")].join("\n")` 构造嵌入文本 → `getEmbeddingProvider().embed(...)` 批量 → 写 `generated.json`(含 `providerId/model/dim`)。
- `package.json` 加 `"kb:embed": "node scripts/build-knowledge-embeddings.mjs"`。
- 脚本**幂等可重跑**;provider 缺失时明确报错并以非 0 退出。

### 4. `retrieveKnowledge` 升级为向量检索(关键改造点)
- 改成 **async**:`export async function retrieveKnowledge(query: string, limit = 4): Promise<KnowledgeCard[]>`。
- 流程:
  1. `getEmbeddingProvider()`;读 `generated.json`。
  2. **若 provider 可用且 `generated.json` 的 `dim`/`providerId` 与当前 provider 匹配**:`embed([query])` → 与各卡向量算**余弦相似度** → 过阈值 `RAG_MIN_SCORE`(默认 `0.30`,加注释说明可调)→ 按分降序取 `limit`。
  3. **若 provider 不可用 / embed 失败 / 无 `generated.json` / 维度不匹配**:**关键词兜底** `keywordRetrieve(query, limit)`(按 `keywords`(权 1.0)/`tags`(权 0.5)/`title`(权 0.8) 命中加权打分、归一化、取 top-k),**保证永不抛错、永不开天窗**。
- 把**余弦、归一化、top-k、关键词打分**抽成纯函数,便于单测。
- **更新唯一调用点** `src/app/api/chat/route.ts:250` → `const knowledge = await retrieveKnowledge(...)`(`POST` 已是 `async`,见 `route.ts:65`,安全)。确认无其它调用点(现仅此一处 + 测试)。
- **容错与安全**:embedding 调用必须有超时(≤ 现有 http 超时),失败立即兜底;**危机判定在检索之前、不依赖 KB——保持这一点,RAG 绝不得影响确定性安全地板或拖慢危机路径**。

### 5. 测试(CI 不可联网)
- 新增 `src/lib/embeddings.test.ts`、`src/lib/knowledge.test.ts`:用 **mock provider**(注入假向量,依赖注入或 env 切换)测:余弦排序、阈值过滤、top-k、维度不匹配回退、provider 缺失回退到关键词、关键词打分正确。
- **不得在测试里真打网络**。
- 跑 `npm test`、`tsc --noEmit`、`npm run build`、`npm run lint`、`npm run test:ratchet`(**safety ratchet 不准退**)。

### 6. 怎么切到本地模型(写进 README 或脚本注释)
- 起一个 Python 边车暴露 `POST /embed` `{input:[...]}`→`{embeddings:[[...]]}`(`sentence-transformers` + `BAAI/bge-m3`)→ 设 `EMBEDDING_PROVIDER=local`、`EMBEDDING_BASE_URL=http://127.0.0.1:<port>`、对应 `EMBEDDING_DIM` → **重跑 `npm run kb:embed`**(换 provider 必须重算卡片向量,否则维度/语义不一致会触发回退)。

---

## 流② 知识卡内容(出草案,待临床签字)

- 在 `src/lib/knowledge-cards.ts` 写 **~20–30 张起步卡**,主题覆盖:焦虑、广泛性担忧/反刍、惊恐发作、抑郁低落、低动力/快感缺失、睡眠、哀伤丧失、自我批评/羞耻、自我慈悲、人际冲突、边界、孤独、愤怒、压力/倦怠、学业/工作压力、自尊、完美主义、情绪调节(DBT)、矛盾心理(MI)等。
- 每张卡:贴合 `KnowledgeCard` 类型;`content` 用**安屿一贯的声音**(参考 `prompts.ts` 与 `personas.ts`);`keywords` 要含**口语 + 症状词 + 同义词**(中文为主,可含英文量表名如 PHQ-9/GAD-7/ISI);`guidance` 给**可执行**的回应建议。
- 取材自 **CBT/DBT/ACT/MI 循证框架**,**非诊断、非医疗建议**。
- **每张卡标注「待临床签字」**(建议加可选字段 `clinicalStatus?: "draft" | "approved"` 或在 `title`/注释标注,但**不改既有 `KnowledgeCard` 必填字段**);并在 `_SAFETY_v2_DRAFTS_待评审.md` **追加一节**登记这批 KB 草案,供心理老师评审。
- **危机/自伤/未成年相关内容不要塞进 KB 当通用知识**;危机仍走既有确定性安全地板,**KB 不介入危机回应**。

---

## 硬约束(全批)
- 流① 工程:没有签字卡片时检索 = 兜底(关键词/空),行为安全、不动危机逻辑 → 可正常验证合并上生产。
- 流② 卡片内容 = **草案待签字**,登记进 drafts 文件,**不擅自定稿/上线**。
- **不破坏**确定性安全地板、crisis 路径、`safety-CI` ratchet;**RAG 失败必须 fail-safe**(兜底,不抛错、不拖慢、不影响危机)。
- **不加向量数据库**;云端向量用 `fetch`,尽量**不加重依赖**(若确需加,先说明理由)。
- `KnowledgeCard` 必填字段保持稳定(`types.ts` / `prompts.ts` 依赖)。
- 隐私:云端模式查询会外发,`.env.example` 注明;本地模式说明怎么接 BGE-m3 边车。
- 匹配作者身份;每项给**可验证证据**(测试输出 / 构建日志 / 示例检索结果);**做不到或有取舍直说,不造假**。

---

## 验收
1. 配好 `EMBEDDING_*` 后 `npm run kb:embed` 生成 `generated.json`(贴出 provider/model/dim 与卡片数)。
2. 起服务,问 **"我最近总是睡不着、脑子停不下来"** → 命中睡眠/反刍相关卡(**贴出检索到的卡 id 与分数作证据**);问无关内容 → 低分兜底。
3. **删掉/不配 key 或删 `generated.json`** → 自动走关键词兜底,不报错。
4. `tsc` / `build` / `test` / `lint` / `test:ratchet` 全绿(贴日志)。

---

## 交付顺序建议
1. 先交**流① 工程**(抽象层 + 向量检索 + 兜底 + 脚本 + 测试)→ Cowork 验 → 合并上生产(此时线上=兜底,安全)。
2. **流② 起步卡草案**产出后交给 Cowork,整理成"心理老师评审包"。
3. 评审签字回来后,把卡片 `clinicalStatus` 置 `approved` 并 `npm run kb:embed` 重算 → 灰度上线真正的向量 RAG。
