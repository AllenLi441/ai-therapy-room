# 人工标注组织者执行清单

1. 完成 `ETHICS_REVIEW_CHECKLIST.md`、补偿决定和指南审定；把 `RECRUITMENT_LOG.template.csv` 复制为本地 `RECRUITMENT_LOG.csv`。未完成不得招募。
2. 运行 `node eval/human-study/prepare.mjs`，核对 `sheets/MANIFEST.json`：calibration 四类各 3、focal 四类各 25、calibration/main 无会话重叠。
3. KEY 只给数据管理员，已由 `.gitignore` 强制排除，禁止上传 GitHub、网盘共享目录或发给标注者。把盲表复制为三份 `annotator_H01/H02/H03.csv`，分别发送；同时发送指南、须知和同意书。
4. 三人只做前 12 行。运行 `node eval/human-study/analyze.mjs <三份表> --phase calibration`；若 κ < 0.4，停止并由教师重新培训，不能继续正式集。
5. 通过后分 2–3 个时段完成正式集。组织者不得查看答案后定向提示。
6. 运行分析器。有未决分歧时，把 `adjudication_needed.csv` 交给教师；教师填写标签、ID、日期和理由。
7. 全部分歧解决后才生成 `human_gold.jsonl`。归档三份原始表、同意记录、仲裁表、manifest hash 和报告。
8. 论文中明确报告：真实标注者人数/资格、抽样、focal/context、κ、仲裁比例、不自然度、伦理判断和补偿；不得把模型 C/D 称为人工裁判。
