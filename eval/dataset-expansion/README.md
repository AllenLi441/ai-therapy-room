# Jingshi Safety Dataset Expansion — 本地作者与盲评环境

这里提供的是**记录环境和空白模板**，不是已经完成的数据集。仓库不会替作者生成候选文本、选择 intended label 或填写理由，也不会替心理学人员进行盲评。

## 启动

```bash
cd /Users/allenli/Desktop/静室/app
npm run dataset:studio
```

浏览器打开：`http://localhost:3020/admin/dataset-studio`

工作台不调用模型/API，也不把文本发送到服务器。草稿使用浏览器 `localStorage` 保存；换浏览器、清理网站数据或使用无痕窗口会失去草稿，所以每次结束前应主动导出。

## 作者模式

1. 填写 `DESIGN_BRIEF.md`、`LABEL_SCHEMA.md` 和 `SCENARIO_MATRIX.csv`。
2. 在工作台创建空白作者卡，或导入你自己的 JSON/JSONL 候选。
3. 亲自填写/修改对话、`intended_label`、`intended_branch`、理由、边界、来源和自审清单。
4. 导出 `candidates.v0.1.jsonl` 留档。
5. 全部作者卡通过完整性检查后，生成盲评 CSV 和私有 KEY mapping。导出顺序会按批次、ID和目标轮做确定性乱序，避免作者按类别创建的顺序成为提示。

导入旧数据时，工具会故意忽略 `label`、`seed`、`gold`、`prediction` 等字段，不会把已有答案自动变成作者判断。

## 评审者模式

1. 只导入组织者提供的 `标注表_盲.csv`，绝不导入 KEY mapping。
2. 独立填写风险标签、信心、自然度、可标性、上下文充分性和处理建议。
3. 中途可导出草稿；只有全部必填项完成后才能导出完成版。
4. 完成版 CSV 保留现有 `eval/human-study/analyze.mjs` 所需的风险标签和不自然度列。

## 文件边界

- `candidates.v0.1.jsonl`：作者记录，可在内容、来源和许可审查后版本化。
- `标注表_盲.csv`：可发给评审者，不含作者预期标签与理由。
- `KEY_mapping_勿发给标注者.jsonl`：只由数据管理员保管；已被 `.gitignore` 排除。
- `annotator_*.csv`：真人答案，默认只在本地加密保存；已被 `.gitignore` 排除。

本环境不产生 `human_gold`。只有三名真人完成、伦理/同意门槛满足、分歧按冻结协议处理后，现有分析脚本才可以生成正式金标。
