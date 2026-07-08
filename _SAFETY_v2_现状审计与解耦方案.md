# 安全重构 v2 · 现状审计 + 安全地板解耦方案

> 这是 v2 的**第一步交付**:基于真实源码的现状数据流 + LLM 依赖点 + 解耦方案,供评审。
> **本文不改任何危机文案/阈值/词表。** 配套:`_SAFETY_REARCH_v2_危机理解.md`(总原则)、`_PLAN_总体计划书.md`(调度)。
> 审计日期:2026-06-14。所有引用为只读核对的真实文件路径。

---

## 0. 一句话结论

好消息比预想多:**热线号码已经是确定性常量(模型被明令禁止编造),词典检测先于任何 LLM 运行——所以"显式可检出的危机"本来就不依赖 LLM。** 真正的结构问题只有三个,且互相独立:

1. **隐式风险 fail-open**:只有"语义隐式"信号(靠 Kimi 抓)的消息,在 Kimi 超时/报错且词典判 none/泛-low 时,会被**放行给 DeepSeek、不触发任何热线模板**。这是唯一的 LLM 依赖型安全缺口。
2. **检测与回应硬耦合**:每个检测分支在 `route.ts` 里**直接 return 一段写死模板**;"安全地板"不是独立组件,只是早返回的副产品。
3. **危机持续态靠字符串匹配模板原文**:`detectActiveCrisisFromHistory` 通过匹配自己发过的模板标记句来判断"是否仍在危机态"——改文案会悄悄改坏检测(也是当初自循环 bug 的同源)。

---

## 0.5 ⚠️ 已核实的 LIVE 安全缺口(优先处理)

**未成年人专属热线(12355)在生产环境永远不会送达用户。** 两次独立审计 + 定向只读核实确认:

- `createMinorSupportLine`(青少年服务台 **12355** + 12356,`safety.ts:1079/1088`)和 `hasMinorContextCue`(未成年语境识别,`safety.ts:1091`)**已实现且有单测**;
- 但它们在 `route.ts:28-29` 只是被 **import,从未被调用**;全代码库除单测外**无任何生产调用点**;
- 危机/自杀模板(`createCrisisResponse`/`createSuicideConcernResponse`)里**只有成人热线**(110/120、12356、010-82951332、希望24、988/911),**没有 12355、也没有"找信任的成年人/学校老师"**;
- **净效果:未成年人处于危机时,识别得到、但只拿到成人化资源,青少年热线从不出现。** 这是当前线上的真实安全漏洞。

**修法很小且确定性**(在危机/自杀分支里调 `hasMinorContextCue(当前消息)`,命中则把 `createMinorSupportLine(language)` 追加到模板)。但因为它**触及危机文案/号码清单**,按护栏需**临床确认 12355 措辞 + 未成年识别触发**后再落码。建议**快速通道**处理(资源已写好,主要是评审 + 接线)。

> 另核实:`session-plan.ts` / `case-formulation.ts` 的"危机 turn-plan"是**仅供模型参考的元数据**,不做权威安全决策、不向用户输出任何安全文案——**不是缺口**,可达但只是建议性。

---

## 0.6 修复提案(待临床签字 · 暂不落码)

> 这是给临床评审的**一页式可批改件**。范围窄、加性、确定性。**签字前不写码、不上生产。**

**变更范围(加性、不删除任何现有资源):**
- 新增一个确定性 helper `withMinorSupport(text, latestUserMessage, language)`:当 `hasMinorContextCue(当前用户消息)` 命中时,把 `createMinorSupportLine(language)`(12355 青少年服务台 等)**追加**到回应末尾;否则原样返回。集中在一处,符合 v2"资源从一个确定性出口"的方向。
- 应用到**所有**危机/自杀回应出口(不止词典路,否则被 Kimi 抓到的未成年人仍漏 12355):
  - 词典早返:`route.ts:130`(crisis)、`route.ts:137`(suicide_concern)
  - 隐式拦截:`route.ts:198`(crisis)、`route.ts:214`(suicide_concern)

**临床需确认 4 点:**
1. **12355** 是否为当前正确、有效的青少年求助热线;
2. "找信任的成年人 / 老师" 等措辞对**危机中的未成年人**是否恰当、不会造成二次伤害;
3. **加性(append) vs 替换**:建议加性——把成年人误判为未成年,最坏只是**多收到一段有效的青少年资源**(无害);而现状让真实未成年人**拿不到**青少年资源。下行≈0,收益明确;
4. `hasMinorContextCue` 的触发(正则 + 守卫)是否可接受。它仍会**漏掉不写年龄线索的未成年人**——那是 v2 的"检测改进"问题;但本加性修复至少补上"**已识别到的**"情形。

**风险评估:** 加性、不删成人热线;最坏情况 = 成年人多收到一段青少年资源(无害)。**生产保持冻结在 944c866,签字前不落码。** 签字后 CC 在分支上接线(几行)、preview 验、再走合并流程。

---

## 1. 现状数据流(/api/chat,真实顺序)

```
用户消息
 │
 1. 解析/清洗 (route.ts:69-82)
 │
 2. 词典风险 baseRisk = assessConversationRisk(最近4轮聚合)   ← 纯确定性,零 LLM (safety.ts:740-841)
 │
 3. 危机持续态 detectActiveCrisisFromHistory(扫历史中模板标记句)  ← 确定性但脆弱 (safety.ts:900-953)
 │
 4. 有效 risk:exitedCrisis→只判当前句;否则用聚合 baseRisk (route.ts:107)
 │
 5. ★词典拦截阶梯(LLM 之前就短路返回)(route.ts:130-163)
 │     shouldEscalate→createCrisisResponse
 │     suicide_concern→createSuicideConcernResponse
 │     medication/diagnosis/red_flag→各自 boundary 模板
 │     —— 命中即 return 写死模板,不调任何 LLM
 │
 6. (仅当上面都判 benign) Kimi 隐式分类 assessImplicitRiskWithLLM (route.ts:191, 5s 单次无重试)
 │     → decideImplicitIntercept + mergeImplicitWithLexicon
 │
 7. 隐式拦截:mode==crisis→createCrisisResponse;否则→createSuicideConcernResponse (route.ts:195-222)
 │     —— 仍是 safety.ts 里同一批写死模板
 │
 8. 正常路:buildCounselorSystemPrompt(含 getRiskInstruction 软指令)→ 流式 DeepSeek (route.ts:224-272)
       DeepSeek 抛错→createProviderErrorFallback()(通用文案,无热线)
```

**危机文案 + 热线来源**:全部是 `safety.ts` 里 `create*Response()` 内的**写死常量**(如 `safety.ts:449` 含 12356 / 110 / 120 / 988 等)。`knowledge.ts` 的 `retrieveKnowledge` 目前是**空桩(永远返回 [])**,KB 实际没建。前端 `overlays.tsx:98-100` 也硬编了同样的号码。

---

## 2. LLM 依赖点(安全相关)

链路里只有两个 LLM:**Kimi**(隐式分类)和 **DeepSeek**(对话)。危机拦截**只依赖 Kimi**;词典阶梯在前、无需 LLM。

| 点 | 位置 | 成功 vs 失败 |
|---|---|---|
| Kimi 隐式分类 | `implicit-risk.ts:385-435`,5s 单次、无重试 | 失败→`{kind:"error"}`,转入 fail-safe 分支 |
| **fail-safe 分支(最关键)** | `implicit-risk.ts:536-573` | 词典≥medium→交还词典(已被前面阶梯处理);词典 low 且"挨着自杀"(suicide_concern/self_harm/suicide)→升级 suicide_concern;词典 **none / 泛-low(焦虑/压力/失眠)→放行**(fail_open) |
| DeepSeek 对话 | `route.ts:266-272` | 抛错→`createProviderErrorFallback()`,**无热线、无模板**;且**正常流式但内容不当时没有事后安全复核** |
| /api/plan | `case-formulation.ts` | 计划生成无危机拦截、不发安全模板,失败无安全后果 |

**净结论**:
- **显式/词典可检出风险 = 确定性拦截**,Kimi/DeepSeek 全挂也照常给正确热线模板。✅
- **隐式-only 风险 = 依赖 Kimi**;Kimi 一挂 + 词典 none/泛-low → **静默放行**(`implicit-risk.ts:431` 的 warn 已自述"可能漏掉 implicit-only 自伤信号")。这是当初为了反 cry-wolf / 反 DoS 的**有意权衡**,但它是真实的安全缺口。
- DeepSeek 若**流式输出了一段不当/过度安全化的话**,事后无确定性复核(只有抛错时才有 fallback)。

---

## 3. 安全地板评估

- **热线号码 = 确定性常量**(`safety.ts` 多处 + `overlays.tsx`),DeepSeek 系统提示明令"不要编造热线号码"(`prompts.ts:19`),KB 又是空桩——所以**号码永远是对的,模型不会现编**。✅ 这条 v2 不变式现在就成立。
- **但"地板是否被触发"对隐式-only 不是确定性的**:显式→确定触发;隐式-only + Kimi 挂 + 词典 none/泛-low → **不触发任何带热线的模板**(DeepSeek 的 error fallback 也没有热线)。

---

## 4. 耦合点(检测 ↔ 回应)

- **词典 flag → 行内直接 return 写死模板**(`route.ts:130-163`):检测结果直接选并流式一段常量。
- **隐式 mode → 同一批写死模板**(`route.ts:195-222`):`decideImplicitIntercept` 的 `mode` 字符串是 crisis vs suicide_concern 模板的唯一选择器。
- **持续态检测 ↔ 模板原文**(`safety.ts:859-868`):`detectActiveCrisisFromHistory` 靠匹配模板标记句(如"我听见这里有很强的危险信号")来判断危机态——**改模板会悄悄改坏检测**。
- 唯一"软耦合":severity → `getRiskInstruction` 自然语言指令注入 DeepSeek prompt(`prompts.ts:209`),这是检测**告知**而非**替换**回应的唯一一处——也是 v2 想推广的方向。

---

## 5. 解耦方案(建议,按 v2 不变式)

### 5.1 把"安全地板"从早返回里抽成独立组件 ★核心
- 现状:地板只是某个检测分支 `return 模板` 的副产品。
- 目标:建一个**确定性、分类器无关、LLM 无关**的 `safetyFloor(grade, lang)`:给定风险分级(来自任意来源),保证"正确热线 + 通向真人 + 可退出"被呈现。号码继续用常量(已达标)。
- 收益:**回应可以交给 DeepSeek 变暖/不复读,而地板仍被确定性保证**——这正是"检测与回应解耦"。

### 5.2 风险分级:多源合一、词典降为输入之一
- 把 词典(确定性)+ Kimi 隐式 + 量表 + 对话轨迹 合成**一个分级(none/low/med/high + 维度)**,而不是"谁先命中谁裁决"。
- 词典不丢,继续作为**确定性地板的便宜输入**(它本来就先跑,改的是让"合并"显式化)。

### 5.3 用显式状态替代"匹配模板原文"判持续态
- 现状 `detectActiveCrisisFromHistory` 脆弱。改为**显式标记**危机/安全态(已有 `exitedCrisis` 的雏形),不再回头解析自己发过的文字。这样改文案不会改坏检测。

### 5.4 回应 LLM 化 + KB/RAG(在地板之上)
- `knowledge.ts` 现在是空桩,需要**真正建 KB**(经专业评审的稳定化/落地/心理教育材料)。号码已硬编正确,KB 主要用于"让安抚有依据、贴处境",优先级低于 5.1。

### 5.5 影子运行 + 决策日志
- `decision-log.ts` 已有。新检测先**并行影子运行、对比旧逻辑的误报/漏报**,数据可接受后再切换裁决权,不要一步切。

---

## 6. ⚠️ 必须专业评审的点(动手前)
- **隐式-only fail-open 政策**(§2):Kimi 挂时对隐式-only 信号是"放行"还是"给一个更轻的安全确认"?这是 over-triage(吓人/脱敏) vs miss(漏接)的**临床权衡**,不是工程能单独拍的。
- 任何**危机文案 / 分级阈值 / 词表**改动。
- "正常路是否在 grade≥X 时确定性附加安全地板"的策略(见决策②)。
- 特殊人群(未成年/老年/围产期/性少数)的分流与措辞。

---

## 7. 需要你定的决策
1. **隐式-only fail-open**:Kimi 挂时,对"词典 none/泛-low 但可能隐式有风险"的消息——保持现状放行?还是加一个**更轻的安全确认**(不是完整危机模板)兜底?(临床权衡,建议连同专业评审一起定)
2. **确定性地板是否在正常路也保证**:当合并分级 ≥ 某阈值时,即使走 DeepSeek 正常回复,也**确定性地把真实求助通道附在旁边**(模型负责暖,地板负责在)?我建议:是。
3. **KB 现在建还是后置**:先做 5.1/5.3 解耦(高价值、纯结构),KB(5.4)后置?我建议:解耦优先,KB 后置。
4. **影子运行**:切换裁决权前先影子对比?我建议:是。

---

## 8. 建议的落地顺序(全部需评审 gate,不无人值守上线)
- **3a** 抽出确定性 `safetyFloor` + 用显式状态替代模板原文匹配(纯结构,不改文案)。
- **3b** 风险分级多源合一(词典+Kimi+量表+轨迹),输出分级而非直接选模板。
- **3c** 回应 LLM 化 + 建 KB/RAG。
- **3d** 影子运行对比误报/漏报。
- **3e** 专业评审签字。
- **3f** 灰度上线。

> 注:3a/3b 大多是**结构重构**,可在分支上做、preview/影子验;但凡触及危机文案、阈值、fail-open 政策的,先评审再落码。
