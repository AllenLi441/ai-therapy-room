# 阶段 3-4 执行规格:256 条双标注 + 三臂检测对比实验(供实现,2026-07-08)

目标(论文 RQ):在 256 条安全评测集上 ①完成双模型独立标注并出 Cohen's κ;②跑
三条检测臂 vs 纯 DeepSeek 零样本基线,分类别报 precision/recall/F1。

## 环境与既有设施(先读这些,不要重造)

- 数据:`eval/datasets/safety/*.jsonl`(9 文件,每文件首行是 `_meta`,后 24 行为样例)
  + `eval/datasets/multiturn/*.jsonl`(2 文件,首行 `_meta`,后 20 行)。共 256 样例。
  读取时跳过含 `_meta` 键的行。单轮样例字段含 `id`,`text`,`label`,`expected_branch`;
  多轮样例含 `id`,`turns`(逐轮对话)与 `per_turn` 标注(先 `head -2` 实看确认字段名)。
- 标注指南:`eval/datasets/safety/ANNOTATION_GUIDE.md` —— 四类 label 的判定标准
  (none / passive_ideation / active_ideation / crisis,对齐 C-SSRS)。
- κ 脚本(现成):`npx tsx eval/metrics/kappa.ts <A.jsonl> <B.jsonl> --out 报告.md`,
  标注行格式 `{"id":"…","turn":2,"label":"…"}`(单轮 turn 省略/null,单元键 id#turn)。
- 适配层(现成,阶段 1 已通,参考 `eval/adapters/smoke.ts` 的调用方式):
  - `eval/adapters/wordlist.ts` —— 词表臂(纯本地)
  - `eval/adapters/judge.ts` —— LLM 判官臂(走 Kimi)
  - `eval/adapters/pipeline.ts` —— 全管线臂(进程内直调 POST,fast|deep)
  - `eval/adapters/label-maps.ts` —— judge/branch → 四类 label 的映射(务必复用)
  - `eval/adapters/result.ts` —— 统一结果类型
- 密钥:`.env.local`(仓库根)。DeepSeek:`DEEPSEEK_API_KEY`@`https://api.deepseek.com`;
  Kimi:`KIMI_API_KEY`@`KIMI_BASE_URL`(moonshot-v1-8k)。
- ⚠ Kimi 限速极紧:并发 ≤2,429 必须读 retry-after 退避重试;所有跑批脚本必须支持
  **resume**(按 id#turn 跳过输出文件已有行)与逐行落盘 jsonl。
- 每行记录 `api_model` 与 `system_fingerprint`(响应体自报,模型出处审计要求)。

## 交付 1:`eval/annotate/dual_annotate.mjs`

- 标注单元:单轮 = `id`(turn=null);多轮 = 每个用户轮 `id#turnIdx`(输入为截至该轮的
  对话历史)。总单元数打印出来(≈ 216 单轮 + 多轮逐轮)。
- 两名独立标注员(互盲、也不见种子标注):
  - A = deepseek-chat(并发 8)
  - B = moonshot-v1-8k(并发 2)
- Prompt:嵌入 ANNOTATION_GUIDE 四类标签的定义原文(从文件读入或粘贴),零样本,
  temperature 0,要求只输出 JSON `{"label":"<四选一>"}`。解析失败重试 1 次后记 invalid
  (κ 计算时 invalid 行不写入输出文件,并单独统计)。
- 输出:`eval/annotations/annotator_A.jsonl`、`annotator_B.jsonl`(kappa.ts 兼容格式,
  额外字段允许)+ `eval/annotations/README.md` 注明:**这是双模型标注,不是人工标注;
  human_review 仍为 pending,κ 供数据质量参考**。
- 跑完后执行 kappa.ts 生成 `eval/reports/kappa_dual_model.md`(--field label);另将
  两名标注员分别与种子 label 的一致率写入同一报告(简单 agreement %,含分类混淆表)。

## 交付 2:`eval/experiments/detection_arms.mjs`

四个系统,同一批标注单元,金标 = 种子 `label`(4 类):
1. `lexicon` —— wordlist 适配器(本地,全量瞬间)
2. `judge` —— judge 适配器(Kimi,并发 2 + resume)
3. `pipeline_fast` 与 `pipeline_deep` —— pipeline 适配器两档(注意 deep 每条会真调
   DeepSeek 生成 + Kimi 判官,先跑 fast,deep 支持 `--arm` 选择单独跑)
4. `baseline_deepseek` —— 纯 deepseek-chat 零样本 4 类分类 prompt(不看指南定义之外的
   任何系统组件;prompt 给四类定义,输出 JSON label;并发 8)
- 多轮单元:各臂输入截至该轮的完整历史(pipeline 天然支持;lexicon 用
  assessConversationRisk 语义 = 适配器已处理,确认即可)。
- 产出:每臂 `eval/experiments/results/<arm>.jsonl`(id/turn/gold/predicted/api_model/
  fingerprint/ms/error)+ 汇总 `eval/reports/detection_arms.md`:
  - 每臂 × 每类:precision / recall / F1 + support;宏平均 + 加权平均
  - 4×4 混淆矩阵(每臂)
  - 关键切片单列:`passive_ideation` 的召回(论文核心指标)+ 二值化(none vs 任意风险)
    的召回/误报
  - pipeline 臂的 branch(7 类)另附一表,用 label-maps 映射到 4 类进主表
- CLI:`node eval/experiments/detection_arms.mjs --arm all|lexicon|judge|pipeline_fast|pipeline_deep|baseline --resume`
  (.mjs 里可用 execSync 调 `npx tsx` 跑 ts 适配器,或整个脚本直接用 `npx tsx` 跑 .ts —— 二选一,
  与 smoke.ts 现行方式保持一致)。

## 硬性边界

- 不改 `src/` 下任何文件;只新增 `eval/annotate|experiments|annotations|reports` 内容。
- 不把任何 key 写进文件/日志;从 `.env.local` 读。
- 决策日志隔离:pipeline 臂沿用 eval/.workdir 的既有隔离(见 adapters/env.ts)。
- 只构建脚本 + 用 ≤3 条样例做 smoke(每臂/每标注员),**不要自行全量跑**(全量由我们分批跑)。
