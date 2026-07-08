# 静室 / ai-therapy-room — 源码恢复说明

> 恢复日期:2026-06-13 · 恢复者:Claude Code
> 这是部署在 https://ai-therapy-room.vercel.app/ 的 Next.js 应用的**重建源码**。

## 为什么需要恢复

该项目用 `vercel deploy`(CLI)部署,**没有连接 Git 仓库**。Vercel 只保存构建产物,不保存可恢复的源码树;原始源码目录 `~/Desktop/OH-WorkSpace/心理医生/` 已被删除(很可能是 agent 临时工作区/worktree 被清理)。本机、GitHub(AllenLi441)、各处磁盘都已没有这份源码。

## 怎么恢复的

源码是从本机的 **agent 会话记录**(Claude Code `~/.claude/projects/**/*.jsonl`,30 个 transcript)里重建的:把每个文件的 `Write`/`Edit`/`Read` 事件按时间戳全局排序,以"该文件最后一次完整快照(Write 或全量 Read)"为基线,再把其后的 `Edit` 依次回放。worktree 路径已归一到主路径。

## 保真度(详见 `_RECOVERY_MANIFEST.json`)

- **共恢复 113 个文件**,`package.json` 自报 `name: "ai-therapy-room"`(Next.js 16.2.6),与线上项目一致。
- **89 个 `clean`**:来自完整 Write/Read 快照,高保真。
- **19 个 `approx(edit-drift)`**:基线快照之后有少量 `Edit` 未命中。多数"未命中"是因为该 edit 在快照前**已经应用过**(快照里已包含),属无害;少数可能是最后几次改动没落上 → 这些文件可能比线上版本**早一两个改动**。重点复查:
  - `src/components/chat-room.tsx`(最大 UI 组件)
  - `src/app/api/chat/route.ts`、`src/lib/safety.ts`、`src/lib/implicit-risk.ts`、`src/lib/decision-log.ts`、`src/lib/prompts.ts`、`src/app/globals.css`
- **1 个 `engine-fallback`**:`tsconfig.json` 取自同源的 `mental-health-ai-safety-engine`。
- **2 个 `RECOVERED-STUB`**(原文件不在任何 transcript 里,无法恢复,已用可编译的占位实现,文件内有 ⚠️ 注释):
  - `src/lib/knowledge.ts` — `retrieveKnowledge` 现返回空知识卡(回退到通用支持回应)。
  - `src/components/button-press-effects.tsx` — 全局按钮按压微交互,现为 no-op。

## 下一步

1. **验证可构建**(一次重型进程,按你机器规则单独跑):
   ```bash
   cd ~/Desktop/静室/app
   npm install
   npm run build      # 或 npm test —— 跑通即证明重建可用
   ```
   若个别 `approx` 文件报语法/类型错,对照 `_RECOVERY_MANIFEST.json` 里 `failed>0` 的文件人工核对。
2. **立刻接 Git 仓库**(根因修复):`git init` → push 到 GitHub → 在 Vercel 项目设置里连接该仓库。以后任何改动都有版本历史,不会再丢。
3. 恢复后即可对照 `静室_产品提升计划_2026-06-13.md` 修真正的 bug(隐私脱敏 `decision-log.ts`、限流 `rate-limit.ts`、eval 闸门 `find-fp-fn.mjs` 等)——现在有真实源码,可直接改。

## 注意

- 这是**重建**,不是原版逐字节副本。提交前请 `npm run build` + `npm test` 验证。
- 两个 stub 若你别处(另一台机器/Codex 云)还有原版,直接覆盖即可。
