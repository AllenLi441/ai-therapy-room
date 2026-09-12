# 历史评测原件缺失记录

复查时间：2026-09-12。这里保留原始研究 harness，不属于当前产品 CI 的已验证覆盖。`npm run test:legacy` 会检查所有原件；当前明确以非零状态退出，不会跳过或改写成通过。

## 缺失的外部原件：3 个

| 应恢复的位置（仓库根目录起） | 历史消费者 | 当前证据 |
| --- | --- | --- |
| `src/lib/crisis-corpus.json` | `crisis-corpus.test.ts`、`_corpus_probe.test.ts` | 只有测试源码和注释，JSON 原件缺失。 |
| `evals/detection-seed-corpus.json` | `detection-corpus-baseline.test.ts` | 原件缺失；现有 `evals/therapy-cases.json` 不是这个文件。 |
| `evals/detection-redteam-corpus.json` | `detection-corpus-baseline.test.ts` | 原件缺失；不能使用新版 `eval/` 数据冒充。 |

历史 `crisis-corpus` 注释声称 402 条、2026-06-06 生成、clinically-labeled，并记录过 21 个漏报、37 个误报；没有原数据、审核记录或可重算报告支持这些说法。因此它们仅是原文档中的历史声明，**本次没有确认临床标注、覆盖率、准确率或这些基线**。保留原注释是为了审计历史，不是给声明背书。旧阈值没有迁移至当前产品测试。

## 检索范围与结果

- 当前项目及 Desktop 下相关项目的文件名检索，包括静室数据目录、mental-health-llm-eval；排除了依赖、构建缓存及凭据文件。
- 109 个可达 Git 提交的对象和路径；三个 JSON 文件均无对象路径命中。
- `git fsck --full --no-reflogs --unreachable` 发现的 126 个不可达 tree/commit 的路径；均无目标 JSON 文件命中。
- 项目的 `_RECOVERY_MANIFEST.json` 和相关历史引用；可恢复的只有测试源码，没有相应 JSON 原件。

这是上述本地范围内的检索结果，不是对其他磁盘、云盘或未配置远端历史的保证。没有读取凭据，没有从未知文本拼接数据，没有新生成标签，也没有更换基线来让测试通过。

## 当前仍保留的产品回归

`src/lib/crisis-corpus.test.ts` 保留原源码中明确写出的 8 条应升级与 5 条不应升级的具体断言，共 13 条。它们是可复验的工程回归，不是旧 402 条语料的替代品，也不代表临床验证。其他已有的默认产品回归继续执行。

## 将来如何恢复

1. 把有出处、可核对哈希及审核记录的原件恢复到上表的原路径，不要挪用或重命名新的评测语料。
2. 从项目根目录运行 `npm run test:legacy`。脚本会先列出所有缺件；补齐后用独立 `vitest.legacy.config.ts` 执行这里的全部原始 harness，保持实际失败状态。
3. 原始统计、阈值与报告逻辑均保留；只有相对 TypeScript import 和 crisis JSON 引用因搬迁而调整。该命令固定工作目录为项目根目录，因此 detection 的原始 `evals/` 读取、报告输出路径保持可用。
4. 重新核对来源和人工审核状态后，再决定能否建立新的评测基线；不因一次通过而追认原临床声明。

旧 probe 是报告工具，其最后一个断言本身不测准确率；不能把它的通过数量当作安全证据。当前发布检查与后续人工/在线模型评测是不同工作，前者通过不能消除这里记录的原件缺口。
