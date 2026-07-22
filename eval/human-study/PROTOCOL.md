# 人工标注研究协议 v0.2（执行版 · 2026-07-21）

> 目的：由真实人类标注者建立安全标签，替代模型互评作为最终金标。模型 A/B/C/D 均不得计作人工标注。协议、抽样和分析代码已就绪；**机构伦理判断、招募、签署同意和实际标注属于必须由人完成的外部门槛，未完成前不得宣称“人工金标完成”。**

## 1. 角色与资格

- 3 名独立标注者：心理学、精神医学、社会工作或相关专业在读/毕业；至少修过变态心理学、危机干预或同等课程。组织者依据招募问卷核验，从 `RECRUITMENT_LOG.template.csv` 复制本地 `RECRUITMENT_LOG.csv`，只保存匿名参与者 ID 和资格，不收集姓名到分析包。
- 1 名教师/持证专业人员担任指南审定与仲裁者，不参加普通盲标。
- 标注者互盲，不得看到 seed/model label、其他标注者答案或检测臂输出。
- 标注前阅读 `eval/datasets/safety/ANNOTATION_GUIDE.md`、本协议、`sheets/标注者须知.md`，签署 `知情同意书.md`。

## 2. 抽样与分析总体

运行 `node eval/human-study/prepare.mjs` 固定生成：

- 总池：344 个用户轮单元，来自 256 个合成会话；不包含真实用户内容。
- 校准集：12 单元，四类各 3；与主集不存在会话 ID 重叠。
- 主分析 focal：100 单元，`none / passive_ideation / active_ideation / crisis` 各 25。
- 会话闭包 context：当 focal 来自多轮会话时，把该会话其余轮次一并盲标；当前为 42 行。它们保留上下文完整性，但不进入 25×4 类均衡主估计。
- 当前每名标注者共 154 行（12 calibration + 100 focal + 42 context），以 `sheets/MANIFEST.json` 为唯一计数依据。

所有行只展示截至待标轮次的对话历史，并全局确定性乱序。`KEY_mapping_勿发给标注者.jsonl` 仅由数据管理员持有。

## 3. 校准门槛

1. 三人独立完成前 12 条后暂停，不得继续主集。
2. 组织者运行 `node eval/human-study/analyze.mjs <三份表> --phase calibration`；未填写的正式集行会被忽略，只计算校准 Fleiss κ。
3. κ < 0.4：由教师只讨论校准题和规则，重新做一轮新校准；不得讨论正式集。
4. κ ≥ 0.4：可进入主集。正式结果目标 κ ≥ 0.6；低于 0.6 必须在论文中如实披露，并由教师复核边界案例，不能通过删除分歧样本抬高 κ。

## 4. 正式金标与仲裁

- 三人同标或 2/3 多数即为人类金标。
- 三人无多数的条目进入 `adjudication_needed.csv`，由具名教师根据指南仲裁，并记录日期与理由。
- 不得用 seed label、模型输出或“方便论文结果”的方向影响仲裁。
- 分歧、仲裁比例、Fleiss κ、逐类分布和不自然度票数全部保留并报告。
- 只在全部分歧解决后生成 `human_gold.jsonl`；脚本在未解决时以非零状态退出，不会产出伪完整金标。

## 5. 主要统计与边界

- 主要总体：100 个 `analysis_role=focal` 单元；报告分层指标，并按全池类别分布加权回推整体估计。
- 42 个 `context` 单元仅作多轮一致性/会话演化补充，不混入类均衡主估计。
- 每类 n=25 时单类召回置信区间较宽，适合检验约 30pp 以上的大差异，不足以稳定区分 <15pp 的臂间差。
- 真人金标产生后，必须在同一 focal 队列上同时重算 seed、judge、lexicon、pipeline_fast、pipeline_deep 和 baseline，严禁跨队列相减声称标签偏差。

## 6. 伦理、安全与补偿

- 文本全部为合成研究样例，但包含自杀/自伤表达。标注者可跳过、暂停或永久退出，无需说明原因。
- 每次最长连续标注 45 分钟，至少休息 10 分钟；建议拆成 2–3 次完成。组织者不得以速度施压。
- 招募前必须在 `ETHICS_REVIEW_CHECKLIST.md` 记录机构 IRB/伦理委员会的“需要审查/豁免/不适用”书面判断。没有判断不得开始招募。
- 补偿标准必须在招募前书面确定；退出者按已完成工作获得比例补偿，不因退出被惩罚。
- 支持资源：全国统一心理援助热线 12356；紧急危险应联系当地急救/警方。组织者同时提供所在机构心理支持渠道。
- 标注表只使用匿名 ID，加密存储；原始表仅组织者与统计员可访问，论文只发布聚合统计和许可允许的派生数据。

## 7. 执行与产出

```bash
# 1. 生成并验证盲标包
node eval/human-study/prepare.mjs

# 2. 分析代码自检
node eval/human-study/analyze.mjs --selftest

# 3. 三份真实完成表；有未决分歧时先输出 adjudication_needed.csv 并退出
node eval/human-study/analyze.mjs annotator_H01.csv annotator_H02.csv annotator_H03.csv --phase calibration

# 校准 PASS、三人完成全部行后，生成正式金标或未决仲裁表
node eval/human-study/analyze.mjs annotator_H01.csv annotator_H02.csv annotator_H03.csv

# 4. 教师填写仲裁表后重新运行
node eval/human-study/analyze.mjs annotator_H01.csv annotator_H02.csv annotator_H03.csv \
  --adjudication adjudication_completed.csv
```

产出：`human_gold.jsonl`、`HUMAN_GOLD_REPORT.md`、完整分歧/仲裁记录。未产生真实输入表时，这两个最终产出必须不存在。

## 8. 签署门槛

- 标注指南审定人：________________ 日期：________
- 伦理判断记录编号：________________ 日期：________
- 补偿方案批准人：________________ 日期：________
- 数据管理员：________________ 日期：________
