# 2026-07-21 审计修复验收

## 确定性验收命令

```bash
npm run eval:validate
npm run eval:provenance-audit
npm run eval:referee-audit
npx tsx eval/experiments/detection_arms.ts --arm report
npm run eval:human-prepare
npm run eval:human-selftest
npm run eval:remediation-check
npx vitest run src/lib/net.test.ts src/lib/implicit-risk-backup.test.ts
npm run test:ratchet

(cd "${EVAL_SUITE_DIR:?set EVAL_SUITE_DIR}" && node scripts/reconcile_v4_pro.mjs)
(cd "${EVAL_SUITE_DIR:?set EVAL_SUITE_DIR}" && python3 scripts/audit_results.py)

(cd "${PUBLIC_EVAL_DIR:?set PUBLIC_EVAL_DIR}" && node run.mjs all --selftest)
(cd "${PUBLIC_EVAL_DIR:?set PUBLIC_EVAL_DIR}" && python3 scripts/audit_results.py --selftest)
(cd "${PUBLIC_EVAL_DIR:?set PUBLIC_EVAL_DIR}" && python3 scripts/scoreboard.py --selftest)
(cd "${PUBLIC_EVAL_DIR:?set PUBLIC_EVAL_DIR}" && python3 scripts/check_baselines.py)
(cd "${PUBLIC_EVAL_DIR:?set PUBLIC_EVAL_DIR}" && python3 scripts/check_harness_safety.py)
```

## 线上验收（发布后）

2026-07-21 只读快照：生产 alias `ai-therapy-room.vercel.app` 页面仍报告 `0.7.7`；
`/api/health` 为 healthy、DeepSeek/Kimi 均已配置。也就是说旧线上服务当前可用，但**本地
0.7.8 修复尚未发布**。

`vercel curl /api/health` 必须同时返回 `appVersion: "0.7.8"`、
`transport.connectTimeoutMs: 1500` 和 `transport.maxAttempts: 3`。仅看到 Vercel
deployment 为 Ready 或页面仍显示 0.7.7，都不能证明本次重试修复已上线。

## 人工验收

- 真人标注是单独的 human grader；代码自检不能替代。
- `eval:provenance-audit` 默认只量化缺失；只有 `npm run eval:provenance-audit -- --release` 返回 READY 才满足数据 provenance 发布门槛。
- `human_gold.jsonl` 不存在是当前诚实状态，不是允许模型代标的理由。
- 只有 `ETHICS_REVIEW_CHECKLIST.md`、三份真实表、仲裁和 `HUMAN_GOLD_REPORT.md` 齐全后，人工门槛才可勾选完成。
