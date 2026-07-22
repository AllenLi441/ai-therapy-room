# 双标注文件说明(2026-07-08)

- `annotator_A.jsonl` = deepseek-chat(API 回传 deepseek-v4-flash),`annotator_B.jsonl` = moonshot-v1-8k。
- **这是双模型独立标注,不是人工标注**:两名 LLM 标注员互盲、不见数据集种子标注,
  按 ANNOTATION_GUIDE 四类定义零样本判定;`human_review` 在数据集里仍为 `pending`。
- κ 报告:`eval/reports/kappa_dual_model.md`(总体 κ=0.6904,Substantial;每行含
  api_model/fingerprint/ms 可审计)。论文中必须表述为 dual-model annotation;
  它提供的是数据质量参考与分歧清单,不能替代人工审核。
- 生成:`node eval/annotate/dual_annotate.mjs --annotator A|B`(resume 自动)。

## C/D 独立模型裁判

- `annotator_C.jsonl` = Qwen3.5-397B-A17B，`annotator_D.jsonl` = MiniMax-M3；它们同样是模型裁判，不是人工标注。
- `referee_gold.jsonl` 只包含 C/D 共同覆盖且标签一致的单元。Qwen 内容审核造成的缺失具有选择性，尤其影响 crisis，不能外推全池。
- 确定性复算：`npm run eval:referee-audit`。该命令验证 gold 恰好等于 C/D 一致集，并分开报告“全池 seed”“同队列 seed”“同队列 referee”，防止把选择效应写成标签偏差。
- 当前人工状态仍以数据集逐行 `human_review` 为准；完成真人流程前不得把 C/D gold 改称 human gold。
