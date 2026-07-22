# 静室合成安全评测集 Dataset Card（draft v0.2）

## 当前状态

- 256 个合成基础会话，展开为 344 个逐轮评测单元。
- 四级 seed label：`none / passive_ideation / active_ideation / crisis`。
- 包含单轮对抗表达与多轮渐进/恢复场景；全部 `source=generated`。
- 截至 2026-07-21，逐行 `human_review` 仍为 `pending`。A/B/C/D 都是模型标注或模型裁判，不能替代真人金标。
- 当前逐行只有 `source=generated`，没有可核验的 generator/provider/model/prompt hash/生成时间/许可链；不能据此推断生成主体。运行 `npm run eval:provenance-audit` 会量化这些缺口，`npm run eval:provenance-audit -- --release` 是发布前严格门槛。
- 本数据集目前只在 `ai-therapy-room` 仓库内；独立公开仓库 `mental-health-llm-eval` 发布的是公共 benchmark harness，并未公开本数据集。

## 预期用途

- 回归测试心理支持系统的风险识别、干预路由和多轮状态保持。
- 比较相同样本上的 lexicon、judge、完整管线和基线模型。
- 不用于训练临床诊断模型，不代表真实人群分布，不支持个体诊断或医疗决策。

## 金标层级

1. `seed label`：合成时给出的设计标签，只是初始假设。
2. `dual-model annotation/referee`：用于发现分歧和设计问题，不能称人工标注。
3. `human gold`：按 `human-study/PROTOCOL.md` 由三名真实标注者及教师仲裁产生；这是发表安全结论的目标金标。

人类流程完成前，任何报告必须明确写 seed/model-referee 范围，不得使用“专家金标”“人工验证完成”等措辞。

## 与 PsySUICIDE/PsyGUARD 的关系

PsyGUARD/PsySUICIDE 是已有的大规模细粒度资源，论文报告约 14,800 个实例、三人独立标注、κ/多数裁决和伦理流程（EMNLP 2024：https://aclanthology.org/2024.emnlp-main.264/）。本项目当前规模、真实度和人工证据均不支持“比 PsyGUARD 更好”的结论。

可以作为待验证假设的差异只有：本集显式强调会话演化、恢复表达、否定/俚语/拼音规避，以及产品路由 gold。是否构成有效贡献必须由真人标注、外部效度和系统性文献比较验证。

## 已知局限

- 全部为合成文本，语言自然度和真实人群代表性未知。
- 类别为设计性均衡/过采样，不能直接解释为流行率。
- crisis 内容不含可操作方法细节，覆盖面受安全设计约束。
- 模型裁判存在供应商审核选择偏差；C/D referee 子集的 crisis 覆盖尤其薄。
- 多轮单元存在簇内相关，不能把 344 行当作完全独立样本。

## 发布门槛

- 完成真实人类标注与伦理判断；报告 κ、仲裁和不自然度。
- 建立许可、版本、数据卡、变更日志和可删除机制。
- 每行补齐 `provenance.origin/generator/provider/model/prompt_sha256/created_at/human_editor/license`，且不得猜填历史生成信息。
- 对外发布前再次检查是否含真实用户数据、PII 或可操作自伤方法。
- 若未满足上述门槛，只能发布协议、代码和聚合结果，不能宣称发布了验证后的新数据集。
