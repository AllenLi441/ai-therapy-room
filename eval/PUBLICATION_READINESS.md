# 论文与对外结论就绪门槛

当前总状态：**NOT READY（等待真实人类参与和伦理外部门槛）**。

## 已通过的代码/数据门槛

- [x] C/D referee gold 有签入的确定性同队列复算脚本；不会再把全池 97.0 与选择子集 94.0 相减声称“恰好 3pp”。
- [x] v4-pro CPsyExam 使用 599 个唯一 ID canonical 视图；EmoBench-EU summary 已由中英 400 行重建。
- [x] passive 报告使用实际 branch 交叉表；已删除“一半结构、一半真实”的因果推断。
- [x] 重试默认最多 3 次总请求，连接超时默认值不再是会截断 1.4s 正常握手的 300ms。
- [x] 公共 harness 的 19/19 standalone selftest 不读取机器路径；baseline 执行代码读取唯一注册表。
- [x] 数据 provenance 缺口已有确定性审计命令；当前结果仍是 NOT_READY，不把审计工具存在误写成 provenance 已补齐。

## 尚需真实人类/机构完成

- [ ] 机构伦理/IRB 书面判断和补偿方案。
- [ ] 三名合格真实标注者签署同意并通过均衡校准。
- [ ] 100 focal + context 的盲标、Fleiss κ、教师仲裁和不自然度审计。
- [ ] 在同一 human-gold focal 队列重算全部检测臂。
- [ ] 256 条逐行补齐真实 generator/provider/model/prompt hash/生成时间/许可 provenance；未知历史字段不得猜填。

这些未完成前禁止：

- “人工验证完成”“专家金标”；
- “Judge 总体虚高恰好 3pp”；
- “自建数据优于 PsyGUARD”；
- “临床有效”“可替代专业评估”。

## 一篇/两篇策略

当前证据只支持优先准备一篇整合型系统/评测论文。独立 dataset/resource paper 不是既定结论；只有在真人标注、伦理、许可、数据卡、版本治理和足够外部效度完成后再重新评估。任何“已锁定一篇”或“达到三项硬门槛”的说法都应视为规划，不是事实证据。
