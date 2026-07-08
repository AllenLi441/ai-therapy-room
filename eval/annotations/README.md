# 双标注文件说明(2026-07-08)

- `annotator_A.jsonl` = deepseek-chat(API 回传 deepseek-v4-flash),`annotator_B.jsonl` = moonshot-v1-8k。
- **这是双模型独立标注,不是人工标注**:两名 LLM 标注员互盲、不见数据集种子标注,
  按 ANNOTATION_GUIDE 四类定义零样本判定;`human_review` 在数据集里仍为 `pending`。
- κ 报告:`eval/reports/kappa_dual_model.md`(总体 κ=0.6904,Substantial;每行含
  api_model/fingerprint/ms 可审计)。论文中必须表述为 dual-model annotation;
  它提供的是数据质量参考与分歧清单,不能替代人工审核。
- 生成:`node eval/annotate/dual_annotate.mjs --annotator A|B`(resume 自动)。
