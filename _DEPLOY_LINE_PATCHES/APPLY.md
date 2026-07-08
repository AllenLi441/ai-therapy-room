# 静室安全修复 — 落到部署线 (wip/demo-backup-2026-06-07)

三个补丁，全部通过只读 `git apply --check`，对**当前**部署线干净落地。
最后核验时部署线 = `wip/demo-backup-2026-06-07` @ **80efb51**。
⚠️ 仓库有多个并发 worktree/会话，部署树偶尔有未提交改动。应用前确认其他会话到了停手点；若部署线 HEAD 又变了，先重新 `apply --check`。

来源分支：
- `claude/hardcore-hawking-c5e3e5` → P1-5 + P1-1
- `claude/crisis-mode-fix` @ (P3+A+B，基于 80efb51) → p3-crisis-mode

## 补丁清单
- **p1-5-privacy-redaction.patch** — `decision-log.ts` 默认不写用户原文（脱敏 userMessage/conversationDigest/evidence/rationale，`QUIET_ROOM_DECISION_LOG_RAW=1` 才落原文）+ 新增测试。
- **p1-1-eval-gate.patch** — `find-fp-fn.mjs`：隐性自伤释放成 normal 记 `IMPLICIT_FN` 并默认让闸门变红（`SAFETY_EVAL_IMPLICIT_MISS_BUDGET=N`，NaN/负值→0）。
- **p3-crisis-mode.patch**（合并了原 1-4 闭环 + 危机模式总修复，6 文件）：
  - **1-4 闭环**（量表感知）：`classifyCrisisCheckReply` + `createCrisisReplyResponse`（escalate→硬推急救/热线；stabilize→肯定+grounding）。英文危机模板补 UK/IE 116 123、AU 13 11 14、findahelpline.com。concise 两拍开头（`createCrisisResponse` 的 `concise?`，默认关）。
  - **Fix A（安全模式不再卡死秒回）**：确定性危机模板**只在本轮有新急性信号**时触发（`dangerLevel===3 && baseRisk.shouldEscalate`）；纯续命态放行到 LLM 路径（仍带 danger-3 安全指令）→ 用户得到**有回应的安全对话**，危机标记自然滑出 4 轮窗口而不是被反复钉住。
  - **Fix B（可保守退出）**：`detectActiveCrisisFromHistory` 在用户明确表达安全（"我安全了"/"好多了"/"I'm safe now"；**不认**裸"1"动作确认；**有硬自伤词时不退**）时返回 `deescalated:true`；`/api/chat` 和 `/api/safety-check` 都 `&& !deescalated` 覆盖前端 sticky flag；前端 danger<3 时清 `crisisSession` 面板。任何新硬信号立即重新升级，无基于时间的自动放行。
- ~~p4-model-picker / p5-honest-model~~ — **撤销，不要应用**。实测真相(另一个会话发现):provider API 只认 `deepseek-v4-pro` / `deepseek-v4-flash`,**拒绝 `deepseek-v5.5-*`(空流→卡住/空回复)**。所以 p4(留 5.5)会废、p5(发 `deepseek-chat`)在 prod 也可能废。**模型选择器由那个并发会话用 v4 映射方案修(`toDeepSeekApiModel`),不归这批补丁。**
- ~~p4-model-picker / p5-honest-model~~ — **撤销，不要应用**。实测真相(另一个会话发现):provider API 只认 `deepseek-v4-pro` / `deepseek-v4-flash`,**拒绝 `deepseek-v5.5-*`(空流→卡住/空回复)**。所以 p4(留 5.5)会废、p5(发 `deepseek-chat`)在 prod 也可能废。**模型选择器由那个并发会话用 v4 映射方案修(`toDeepSeekApiModel`),不归这批补丁。**

## 应用步骤（在 `/Users/allenli/Desktop/OH-WorkSpace/心理医生` 跑）
```bash
P=/Users/allenli/Desktop/OH-WorkSpace/心理医生/.claude/worktrees/hardcore-hawking-c5e3e5/_DEPLOY_LINE_PATCHES

# 注：这 3 个补丁本轮已 git apply 到部署线(未暂存)。以下供你在干净环境重放/复核。
# 1. 只读复核
for f in p1-1-eval-gate p1-5-privacy-redaction p3-crisis-mode; do
  git apply --check "$P/$f.patch" && echo "$f OK" || echo "$f NEEDS RECHECK"
done
# 2. 应用（留作未暂存改动，方便 review）
git apply "$P/p1-1-eval-gate.patch" "$P/p1-5-privacy-redaction.patch" "$P/p3-crisis-mode.patch"
# 3. 验证（部署线全量；含隐私 3 条 + 1-4 回复 10 条 + 降级 6 条）
npm test
```

## 应用后注意
- **危机模式新行为**：检测到危机→静态模板（一次）；之后用户能正常对话（LLM 安全回应，面板还在）；用户说"我安全了/好多了"→退回正常、面板消失；任何新信号→立即重升级。不再"秒回同一套、只能删对话"。
- 「最高 3 级」是设计如此（3=安全模式=顶格）；安全模式下不调聊天 LLM（静态模板），所以换模型不影响危机回复。
- **模型选择器存疑**：`deepseek-v5.5-pro` 等不是 DeepSeek 官方 API 真实模型名，无映射，`resolveDeepSeekModel` 会把任何非这 4 个的值回退成默认 → 选择器可能是摆设（选哪个都同一真实模型）。想真区分要加映射。（未改，待你定。）
- P5：W1 生产日志研究流程需服务端设 `QUIET_ROOM_DECISION_LOG_RAW=1`。
- P1：宽松行为用 `SAFETY_EVAL_IMPLICIT_MISS_BUDGET=<n>`。
- 提交（无 remote）：`git -c user.name="Allen Li" -c user.email="allenli@AllendeMacBook-Air.local" commit ...`

## 清理（可选，我做的 worktree）
- `git worktree remove .claude/worktrees/crisis-reply-loop`（旧，已被 crisis-mode 取代）
- `git worktree remove .claude/worktrees/crisis-mode-fix`（P3+A+B 来源；提交保留在 .git）
