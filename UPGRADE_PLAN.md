# 静室 · UI 全面重设计 + Bug 修复 · 执行计划书

> 给 fable5 的执行手册。目标：**用最小 usage 做出最好的升级**。
> 作者勘察日期：2026-06-11 ｜ 适用分支：建议新开 `feat/ui-redesign-v3`
> 全程纪律见 §2，逐条可复制的 prompt 见 §7。

---

## 0. 一句话给 fable5

> 「先按 §3 跑**一次**批量诊断生成 `BUGS.md`，再按 §5 的任务卡**只重写 `globals.css` 这一个文件**完成全面视觉重设计（逻辑组件几乎不动），最后按 §6 自检。设计方向已锁定 = §5.1【静室 2.0：极简内核 + 选择性玻璃浮层】。全程遵守 §2：一次只跑一个重进程、用 `build` 不用 `dev`、扫描必须指定目录跳过 `node_modules`、收尾必须 kill 后台 PID。」

---

## 1. 项目现状速览（已勘察确认的事实）

| 项 | 事实 | 对升级的含义 |
|---|---|---|
| 框架 | Next.js 16.2 / React 19 / Tailwind 3.4 / TS 5.7，已部署 Vercel | 改 CSS 不破坏路由与 API |
| UI 入口 | `src/app/page.tsx`(5 行) → `src/components/chat-room.tsx`(**2238 行**) | 逻辑都在一个大组件里，**尽量别动它的结构** |
| 样式 | `src/app/globals.css` = **6384 行**，按 `/* ===== 区块 ===== */` 清晰分区 | 重设计的主战场，可按区块逐段替换 |
| 样式耦合度 | chat-room.tsx 里**只有 1 处内联 style**、83 个 className | **视觉几乎 100% 由 CSS 决定** → 重设计可不碰 TSX |
| 主题层叠 | css 里至少 4 层互相覆盖：基础区块 → `Theme Base (Nocturne)`(L4208) → `NOCTURNE V2 ELEVATION`(L5443) → `DAYLIGHT light`(L6223) | 典型「覆盖战争」，是 bug 与臃肿的根源，应**收敛成单层 token** |
| 死代码 | 已移除功能仍残留 CSS：语音 `语音/mic/voice` 8 处、`response-progress/pipeline` 57 处 | 直接删，立省体积 |
| 设计 token | `tailwind.config.ts` 已把工具类映射到 css 变量（`--ink`/`--accent`/`--surface`…），自称 "sage design system" | **token 接口已就位**，重设计=换 token 值 + 收敛区块 |
| 动画 | 14 个 `@keyframes`，已有 `prefers-reduced-motion` 分支 | 保留可访问性分支，别新增过多动画 |
| 测试 | DEMO.md 记录 296 passed / 39 文件 ｜ `npm test` = vitest | 有安全网，重构后必须保持全绿 |
| 主题切换 | `layout.tsx` 用 `localStorage('quiet-room-theme-v1')` + `data-theme` 暗/亮 | 重设计需同时维护暗/亮两套 token |

**结论**：这是一个 **CSS-bound** 应用。「全面重设计」的最省做法 = 把 `globals.css` 从「4 层覆盖 + 死代码」收敛为「1 层 token + 干净分区组件样式」，TSX 只在 §5.4 列出的少数结构性短板上动手。

---

## 2. 最小 usage 的核心策略（为什么这样最省）

省 usage 的本质 = **少读、少重读、少改文件、少跑重进程**。具体五条：

1. **锁定单文件主战场**：视觉重设计**只改 `globals.css` 一个文件**。fable5 不要反复通读 2238 行的 `chat-room.tsx`——只在 §5.4 的清单项上按行号定点改。
2. **分区替换，不整文件重写**：`globals.css` 有现成 `/* ===== 区块 ===== */` 锚点。每个任务卡只 `Read` + `Edit` **对应区块的行段**，不要每次把 6384 行全读进上下文。
3. **诊断只跑一次**：bug 排查用**一条批量命令**（§3）把 lint+tsc+test+build 串起来、输出重定向到 `BUGS.md`，看文件而不是反复跑。绝不开 `npm run dev`。
4. **token 先行，杠杆最大**：先定 §5.2 的 ~30 个 css 变量（暗/亮各一套）。改 token 值 = 全局换肤，一次编辑撬动整页，比逐条改颜色省 10 倍。
5. **先删后改**：先删死代码（语音 / response-progress 残留 / 整个 V2 ELEVATION 覆盖层），文件先瘦身再重写，后续每次读入的上下文都更小。

> 估算：按本方案，核心视觉重设计的有效编辑集中在 `globals.css` 的 ~2000 行（token + 8 个主区块），而非 6384 行全量；TSX 改动 < 150 行。

---

## 3. 执行协议（环境纪律 —— fable5 必须照做）

直接沿用本机的资源纪律，这同时也是省 usage 的纪律：

- **一次只跑一个重进程**：不得同时 `build` + `test` + `dev`。
- **永远 `build`，不用 `dev`**：`npm run build` 跑完即退；`dev` 会常驻吃内存。**本计划全程不需要 dev server**。
- **后台进程显式收尾**：若用 `run_in_background`，存 PID，结束前 `kill`。
- **扫描指定目录**：禁止 `find /`、`du ~/*`。要扫就 `find src -type f -prune` 跳过 `node_modules`。
- **大文件先看大小**：`wc -l` 后再决定读法；只读需要的行段（用 offset/limit）。
- **内存预算 ≤ 8GB**，留 16GB 给系统。命令突然变慢 5× 或终端冻结 >5s 立即停手回收。
- **agent 并行 ≤ 2，默认顺序跑**；**绝不并行** `npm install` / `next build`。

**一次性诊断命令（阶段 A 唯一的重进程，串行）：**

```bash
cd <repo> && \
( echo "## tsc"; npx tsc --noEmit; \
  echo "## lint"; npm run lint; \
  echo "## test"; npm test; \
  echo "## build"; npm run build ) > diagnose.log 2>&1
# 跑完读 diagnose.log，据此填 §4 的 BUGS.md。不要逐条重跑。
```

**会话结束自检（四步）：**

```bash
# 1) 没有遗留 dev server
pgrep -fl "next dev" || echo "ok: no dev server"
# 2) 没有端口占用
lsof -i :3000 2>/dev/null || echo "ok: 3000 free"
# 3) 没有遗留后台 PID 文件
ls *.pid 2>/dev/null && echo "WARN: pid file left" || echo "ok: no pid files"
# 4) 工作区干净可回滚
git status --short
```

---

## 4. 阶段 A —— Bug 排查（产出 `BUGS.md`）

**做法**：跑 §3 的一次性诊断 → 把结果按下表分级写进新建的 `BUGS.md`，**只修 P0/P1，P2 列出不修**（控制 usage）。

| 级别 | 定义 | 处理 |
|---|---|---|
| P0 | 阻断：build 失败 / tsc 报错 / 测试红 / 运行时崩溃 | 本轮必修 |
| P1 | 影响体验：明显视觉错位、暗/亮主题串台、可访问性缺失、控制台报错 | 本轮必修 |
| P2 | 优化项：死代码、冗余覆盖、轻微间距 | §5 重设计时**顺带**清掉，不单独立项 |

**已知高发区（fable5 重点看这几处，多半能直接归类）：**

1. **主题层叠冲突**：`Nocturne`(L4208) / `V2 ELEVATION`(L5443) / `Daylight`(L6223) 三层重定义同一批组件（`.message`/`.composer`/`.chat-panel`…）。注释里已自承 "single source of truth is the V2 block below"（L5078, L5357）——说明早期区块的同名规则是**死规则被覆盖**。归 P1/P2。
2. **死代码**：语音功能已移除（commit `03bc057`）但 css 残留 8 处 `语音/mic/voice`；`response-progress` 残留 57 处。归 P2，删。
3. **`!important` 6 处**：定位这 6 处，多半是覆盖战争的补丁，重设计后应能去掉。归 P2。
4. **Daylight 亮色主题覆盖不全**：暗色规则远多于 `[data-theme=light]`（30 条）。逐个组件核对亮色下是否串台/低对比。归 P1。
5. **运行时**：诊断里若 `npm test` / `tsc` 有红，全部 P0。

> `BUGS.md` 模板：每条写 `- [P?] 现象 | 文件:行 | 修法一句话`。修一条勾一条。

---

## 5. 阶段 B —— UI 全面重设计

总思路：**token 收敛 → 分区重写 → 删覆盖层**。顺序很重要（先立 token 再改组件，避免来回返工）。

### 5.1 设计方向（已锁定）

**方向：静室 2.0 —— 极简内核 + 选择性玻璃浮层。** 在现有 Nocturne 暗色基调上演进（风险最低、usage 最省），把「极简」做到位，只借用 Apple Liquid Glass 里「安全」的那几样，丢掉「危险」的那几样。

**为什么不整页套液态玻璃**：Liquid Glass 的核心是半透明+模糊+折射高光，代价是对比度与易读性下降（Nielsen Norman Group 评测：界面变得「焦躁、黏人、更难辨认、不断抢注意力」；苹果后续被迫加透明度强度滑块补救）。静室面对的是低落/焦虑/危机用户，需要低刺激、高可读、注意力不被夺走——满屏玻璃是**反作用**，且会削弱危机条与安全色。所以：极简全拥抱，玻璃只用一层、只用在浮层。

**借用（让界面"贵"而不吵）**：连续大圆角、柔和光感深度（用极淡内/外发光替代到处描边）、材质分层的层级感、缓慢克制的微动效（接现有「呼吸」主题）。

**丢掉（会降可读 / 抢注意力）**：正文与对话气泡下的毛玻璃、飘浮折射高光、强反光、会随背景变色的半透明控件。**内容表面一律实色高对比**；半透明只留给"用完就走的 chrome"。

**五条具体规范（fable5 据此改 token / 写样式）：**

1. **排版当主角**：一个克制的字号阶梯 + 衬线标题（Noto Serif SC 的文气）+ 慷慨行距与留白。这是高级感最便宜、最有效的来源，优先级高于任何特效。
2. **深度靠光不靠线**：去掉满屏 1px 描边，改用极淡柔和阴影 / 内发光做层级（`--shadow-sm/md/lg` 走低不透明度、大模糊、小位移）。
3. **单一强调色 + 低饱和**：一个 sage / 靛蓝 `--accent` 贯穿全程，其余近中性。颜色越克制越平静越贵。
4. **只在浮层用一层薄玻璃**：仅限设置抽屉、量表弹窗、首屏知情同意弹窗 —— `backdrop-filter: blur()` + 半透明表面，且**必须叠一层暗遮罩（scrim）兜底文字可读**。内容区、消息气泡、危机条、**危机帮助弹窗（含救助热线，生命攸关）禁止玻璃化**，一律实色高对比。
5. **触觉化微动效**：按钮按下轻微下沉、消息进入柔和上浮、呼吸标记缓慢光晕。慢、轻、有节制，与治疗语境同频。

> ⚠️ **红线（不可越）**：安全色（`--safety`）与危机提示条（Crisis Strip, L2430/L5389）必须保持高可读性、实色背景、不被任何玻璃 / 装饰削弱 —— 这是心理应用的底线。
>
> ♿ **可访问性兜底**：所有玻璃浮层必须为 `prefers-reduced-transparency`（及现有 `prefers-reduced-motion`）提供**实色降级**；正文对比度满足 WCAG AA。

### 5.2 第 1 步：建立单一 token 层（最高杠杆）

在 `globals.css` 顶部 `:root` 与 `html[data-theme="light"]` 各定义同一组变量（约 30 个），全站只认这套：

```
背景/表面：--bg --surface --surface-raised --border --border-strong
文字：    --ink --ink-secondary --ink-tertiary
品牌/强调：--primary --accent --accent-soft
语义：    --safety --safety-bg --crisis --success --warn
节奏：    --radius-sm/md/lg --space-1..6 --shadow-sm/md/lg
排版：    --font-display --font-sans --font-serif --leading-relaxed
```

`tailwind.config.ts` 已经引用了其中一部分（`--ink`/`--accent`/`--surface`/`--primary`/`--safety`），**保持变量名不变**即可零成本接管所有 `bg-paper`/`text-ink` 等工具类。

### 5.3 第 2 步：按区块重写组件样式（任务卡）

每张卡 = 一次 `Read 区块行段 → Edit`。**不要整文件重写**。按以下顺序（从骨架到细节）：

| # | 区块（行号锚点） | 重写要点 | 优先级 |
|---|---|---|---|
| B1 | `Theme Base / V2 ELEVATION / Daylight`（L4208/L5443/L6223） | **三层合并为一层**：把最终生效的规则提到对应组件区块，删除被覆盖的早期同名规则。这是减重核心。 | 必做 |
| B2 | `Layout`(L1580) + `Chat Panel`(L2174) + 响应式(L3917) | 重新定义 app 骨架间距/栅格/最大宽度；核对 860/768/520px 三个断点 | 必做 |
| B3 | `Messages`(L2713) + `Composer`(L3129) | 对话气泡、用户/AI 区分、输入区——用户停留最久的地方，重点打磨 | 必做 |
| B4 | `Buttons`(L3198) + `Form Fields`(L1743) + `Prompt Cards`(L3267) | 统一按钮/输入/卡片的圆角、阴影、focus 态（用 token） | 必做 |
| B5 | `Disclaimer Dialog`(L2653) + `Brand`(L1650) + `Breathing Mark`(L1692) | 首屏知情同意 = 第一印象，单独打磨 | 必做 |
| B6 | `Crisis Strip`(L2430) + `Crisis Help Dialog`(L2551) + `Safety/Privacy`(L2144) | **安全相关，改外观不改逻辑**，保证高对比 | 必做 |
| B7 | `Settings Drawer`(L1605) + `Persona`(L1839) + `Exercise Panel`(L2010) | 设置抽屉/角色/练习面板 | 次要 |
| B8 | `Scale Selector`(L3642) + `Scale Modal`(L3693) + `Case Panel`(L3518) | 量表与个案，专业感所在 | 次要 |
| B9 | 删死代码：`语音/mic/voice`(8) + `response-progress/pipeline`(57，确认 UI 已不渲染再删) | 纯删，减重 | 收尾 |

### 5.4 TSX 允许改动的清单（仅这些，越少越省）

只有当 CSS 无法独立解决时才动 `chat-room.tsx` / 各 panel。允许的结构性改动上限：

- 增删 className / 调整 DOM 包裹层级（为新布局服务）；
- 补 `aria-label` / `role` / `alt` 等可访问性属性（若 §4 发现缺失）；
- **不得**改动状态逻辑、API 调用、安全/危机判定、量表流程。如需改请先单列、单测覆盖。

---

## 6. 验收清单（fable5 收尾必过）

- [ ] `npm run build` 成功（唯一重进程，串行跑）。
- [ ] `npm test` 全绿（≥ 296 passed，不得减少）。
- [ ] `npx tsc --noEmit` 无错。
- [ ] 暗 / 亮主题逐屏目测无串台、无低对比（首屏 / 对话 / 设置抽屉 / 量表 / 危机条）。
- [ ] 危机提示与安全色对比度达标，逻辑未改。
- [ ] `globals.css` 行数明显下降（目标从 6384 → < 4000），`!important` ≤ 原有，死代码已删。
- [ ] 控制台无新增报错 / hydration warning。
- [ ] §3 四步自检全部 `ok`，无遗留 dev server / 端口 / PID。
- [ ] `git status` 干净可回滚，改动集中在 `globals.css`（+ §5.4 范围内的少量 TSX）。

---

## 7. 给 fable5 的逐条 Prompt（复制即用）

> 按顺序发，每条等上一条产出再发下一条，避免返工。

**P1 · 诊断**
```
按 UPGRADE_PLAN.md §3 跑一次性诊断命令，输出到 diagnose.log，然后据 §4 生成 BUGS.md：把问题分 P0/P1/P2，每条写「现象 | 文件:行 | 修法」。只读 log，不要逐条重跑。遵守 §2 纪律（一次一个重进程、不开 dev）。
```

**P2 · 修 P0/P1**
```
只修 BUGS.md 里的 P0 和 P1。每修一条跑一次相关单测确认。P2 留到重设计顺带处理。不动安全/危机/量表逻辑。
```

**P3 · token（方向已锁定为 §5.1 静室 2.0：极简内核 + 选择性玻璃浮层）**
```
按 §5.1 五条规范 + §5.2 在 globals.css 顶部建立暗/亮两套 token（保持 tailwind.config.ts 已引用的变量名不变）：阴影走"低不透明度+大模糊+小位移"，单一 accent，去满屏描边。先只改 token，build 验证不崩。玻璃只用于浮层（§5.3 B7），且带 scrim + prefers-reduced-transparency 实色降级。
```

**P4 · 分区重写**
```
按 §5.3 任务卡顺序，从 B1 开始，逐区块 Read 行段→Edit 重写，一次一张卡。B1 必须把 Nocturne/V2/Daylight 三层覆盖收敛成单层。每完成 2~3 张卡 build 一次。不要整文件重写。
```

**P5 · 删死代码 + 自检**
```
执行 B9 删除语音/response-progress 残留 CSS（确认 UI 不再渲染）。然后按 §6 全部验收 + §3 四步自检。报告 globals.css 前后行数。
```

---

## 8. 回滚 / 安全网

- 开新分支 `feat/ui-redesign-v3` 再动手；`main` 不碰。
- 仓库内已有备份目录 `_backup_nocturne_redesign_2026-06-06/`、`_backup_before_safety_reapply/` 可参照旧样式。
- 每个阶段一个 commit（诊断 / token / 各批区块 / 删死代码），便于二分回滚。
- 任何安全或量表相关测试变红 → 立即停手回滚该步。

---

*本计划基于 2026-06-11 对仓库的静态勘察（grep/wc，未跑 build）。行号为勘察时的近似锚点，fable5 执行时以区块注释 `/* ===== ... ===== */` 为准。*
