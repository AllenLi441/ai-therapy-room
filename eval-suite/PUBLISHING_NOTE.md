# eval-suite —— 心理健康公开基准评测 harness(代码,零依赖 Node)

跑出仓库论文里 CPsyExam / EmoBench / IMHI×9 / PsySUICIDE / MentalManip / CBT-Bench / MDD-5k / EATD 全部数字的打分代码。

## 本目录只含代码 + 聚合结果
**不含**(许可/敏感,不外发):各基准原始数据集、逐条 `results/*.jsonl`(含真实社媒帖文/危机文本/模型原始输出)、`.env`(API key)。
数据请按各基准原始来源自取(链接见 `reports/` 与论文 §8);key 写入本地 `.env`(`EVAL_API_KEY=...`)。

## 运行
```bash
node run.mjs list                 # 列出任务
node run.mjs imhi-dreaddit --model deepseek-chat --run-id demo
python3 scripts/scoreboard.py     # 一键重算计分板
```

## 诚实结论以 reports/imhi_uniform_v3u.md 为准
统一去偏协议后:3 个对 GPT-4 级模型统计显著的硬胜项(EmoBench-EU / MentalManip / CPsyExam);
IMHI 0/9 明确胜微调判别式(dreaddit 与微调平手);此前"DR 胜 13B / dreaddit 超微调"为 yes-偏置假象,已作废。
不构成任何临床有效性验证。
