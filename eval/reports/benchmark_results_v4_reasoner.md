# v4-pro 终端评测与既有 reasoner 结果（审计版）

> 2026-07-21 重算。本文件替代旧版“5 个硬胜项”等已失效结论。IMHI 的统一去偏结果以 `imhi_uniform_v3u.md` 为准；本文件只报告已核验的 v4-pro 终端运行和模型路由边界。

## 1. v4-pro 终端运行

| 任务 | 唯一样本 | 正确 | accuracy | 分项 | 数据状态 |
|---|---:|---:|---:|---|---|
| CPsyExam 抽样 | 599 | 518 | 86.48% | KG-SCQ 322/347；KG-MAQ 89/124；CA-SCQ 90/102；CA-MAQ 17/26 | 原始 600 行含 1 个完全重复 ID；报告使用 canonical 去重视图 |
| EmoBench-EA 官方 prompt/scoring proxy | 400 | 297 | 74.25% | en 75.5%；zh 73.0% | 中英各 200，完整；temp-0 单次调用 |
| EmoBench-EU 官方 prompt/scoring proxy | 400 | 286 | 71.50% | en 74.0%；zh 69.0% | 中英各 200；temp-0 单次调用；旧 summary 仅含中文半跑，现已由原始 400 行重建 |

三组记录的 `api_model` 均为 `deepseek-v4-pro`，fingerprint 均为 `fp_9954b31ca7_prod0820_fp8_kvcache_20260402`。聚合证据见：

- `datasets/eval-suite/results/v4-pro-terminal.audit.json`
- `datasets/eval-suite/results/cpsyexam-deepseek-v4-pro-pro1.canonical.{jsonl,summary.json}`
- `datasets/eval-suite/results/emobench-{ea,eu}-deepseek-v4-pro-pro1.summary.json`

## 2. 对照口径

- CPsyExam 的 599 条是确定性抽样，不是 3,902 条全量；不能把 86.48% 与论文全量数字直接写成同条件显著胜负。论文 GPT-4 `67.43` 还含少样本取优，严格零样本分组加权约为 57.6%。
- EmoBench-EA/EU 各覆盖官方 400 条数据并复用官方 prompt/单次评分，但没有复现论文的 5 次采样多数票 × 4 个选项排列聚合，因此不是完全同协议。GPT-4 论文中英均值分别约为 74.6% / 56.9%（均为我们根据论文分语言数字计算）；这里只能报告描述性点值差，且 benchmark 结果不等于临床有效性。
- 旧版 reasoner 的 IMHI 选择性 prompt 结论已废止，不再把 Dreaddit/DR 写成硬胜项。统一协议结果只引用 `imhi_uniform_v3u.md`。

## 3. 产品路由与评测模型不可混写

- 产品 `pace=deep` 的**回复生成**路由到 `deepseek-v4-pro`。
- 隐性风险判官优先 Kimi；其 DeepSeek backup 当前仍固定为 `deepseek-v4-flash`。
- 因而“产品深度回复使用 v4-pro”成立；“风险检测 deep 臂就是 v4-pro”不成立。

## 4. 复现

```bash
cd /Users/allenli/Desktop/静室/datasets/eval-suite
node scripts/reconcile_v4_pro.mjs
python3 scripts/audit_results.py
```

脚本保留原始文件，不静默改写调用证据；CPsyExam 另产出唯一 ID canonical 视图，EmoBench summary 从完整 JSONL 重建。

## 5. 尚未完成的外部证据

- CPsyExam v4-pro 全量 3,902 条尚未运行；若用于论文主表，应补全量或明确写“n=599 抽样”。
- 人类金标尚未产生；模型裁判和公开 benchmark 不能替代真人安全评审。
- API 余额、历史 key 轮换和过去的线上 smoke 属运行时事件，不能由本地结果文件反向证明。
