# 静室 · 执行规则(给任何接手的 AI)

> 替代旧的 `ASTRA_GOAL_20261003.md`。目标和阶段状态见 `docs/STATE.md`。

## 角色

- **Allen**:定方向;批准合并上线、花钱、对外发布,以及任何涉及账号、身份、签名、法律的事。
- **设计与复核**:Claude。写规格和验收标准,复核结果。
- **执行**:Claude,或任何读了这两份文件的 AI(例如 Codex)。执行者可以替换,规则不变。

## 每个改动的固定流程

1. **规格**:写清楚改什么、验收标准、预计花费。
2. **在功能分支上实现**:不在 main 上直接改。
3. **验证**:
   - `npx vitest run`、`npx tsc --noEmit`、`npm run lint`;最后跑一次 `npm run build`。
   - **改到安全相关代码时**(`safety.ts`、`implicit-risk.ts`、`crisis-*`、`api/chat/route.ts`),还必须跑安全回归。约 ¥1:
     ```bash
     EVAL_DEEPSEEK_API_KEY=… npx tsx eval/experiments/detection_arms.ts --run-id <新名字> --arm pipeline_fast
     EVAL_DATASET_DIRS=teen EVAL_DEEPSEEK_API_KEY=… npx tsx eval/experiments/detection_arms.ts --run-id <新名字> --arm pipeline_fast
     ```
     门槛:危机类召回不得低于上一版;整体召回不降;误报率上升不超过 2 个百分点。
4. **简报**:≤10 行,写清做了什么、结果、花费、下一步。
5. **Allen 批准** → 开 PR → 在 Vercel 测试版上发真实请求冒烟 → **再次批准** → 合并上线。
6. **更新 `docs/STATE.md`**(指标、余额、决策日志)。

## 硬约束

- **钱**:每个阶段的花费上限写在 STATE。用余额接口查余额(DeepSeek:`GET /user/balance`)。不充值、不付款、不建账号。
- **测试集纪律**:
  - 青少年题集(`eval/datasets/teen/`)冻结后不改;要加新题,另开新版本文件。
  - 不能对着保留集反复调参。
  - 种子集和题集的金标都是 AI 写的,必须如实标注。
- **不冒充**:不让 AI 以彭老师或任何真人的身份说话;不用 AI 打分冒充专家评审。
- **个人信息**:开发和测试不使用真实用户的聊天内容。14 岁以下用户不收集数据。
- **本机安全**(MacBook Air,24GB,无风扇):
  - 一次只跑一个重任务;不启动 `next dev`。
  - 后台进程要记录 PID,用完就 kill。
  - 系统盘至少留 5GB 空间;大文件放 `/Volumes/SSD/mental-health-llm-eval/`(exFAT 格式,遍历和计算哈希时排除 `._*` 文件)。
- **诚实**:没跑的就写没跑;数字要能追溯到原始结果文件。
