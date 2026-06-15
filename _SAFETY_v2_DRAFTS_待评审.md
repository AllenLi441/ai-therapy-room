# 静室 v2 危机内容 —— 评审就绪草案（待心理/精神科专业人士签字）

> **状态:草案,未上线。** 这里集中放 v2 所有需要专业评审的危机内容:危机文案、分级阈值、
> fail-open 政策、KB 临床内容、未成年措辞与触发。每节给出**当前线上值**(供对照)+ **需要确认的问题**。
> 工程骨架在分支 `p3e-safety-v2`,**不部署生产**;任何此处内容的最终值 = 专业签字 + Cowork 复测 + 用户点头 → 才灰度上线。
> 配套:`_SAFETY_v2_现状审计与解耦方案.md`(现状/数据流/§0.5 未成年缺口/§0.6 修复提案)、`src/lib/crisis-resources.ts`(资源单一真值源)。

---

## §1 危机文案(crisis response templates)

**当前线上(`src/lib/safety.ts`)**,均为硬编码静态模板,命中即整段返回:
- `createCrisisResponse`(高风险/危机):安全确认 + 热线 + 「1/2/3/4 安全程度」选择题。
- `createSuicideConcernResponse`(中风险自杀意念):「像是有一部分你在想消失、不醒来…」+ 热线 + 1/2/3/4。
- `createMedicationBoundaryResponse` / `createDiagnosisBoundaryResponse` / `createMedicalRedFlagResponse`(边界类)。

资源号码现已抽到 `crisis-resources.ts`(单一真值源):CN `12356 / 110 / 120` + 北京 `010-82951332` + 希望24 `400-161-9995` + 未成年 `12355`;国际 `988 / 911 / 116 123 / 13 11 14 / findahelpline.com`。

**需要确认:**
- [ ] 危机/自杀模板的**语气、安全确认问法、1/2/3/4 选择题**是否符合循证危机干预原则?有无可能造成二次伤害的措辞?
- [ ] v2 方向是「检测→分级信号 + 模型生成温暖回应(替掉复读模板)」+ **确定性地板必出真实资源**。地板**必出**的最小内容应该是什么?(建议:真实热线 + 「联系身边可信任的人/急救」+ 不打包票)
- [ ] 号码清单是否 canonical、是否最新有效?(尤其 12356 全国心理援助热线、12355 青少年)

---

## §2 分级阈值(grading thresholds)

**当前线上:**
- 词典(`safety.ts`):`assessRisk` 多表匹配取最高级;`augmentWithImplicitAccumulator`:`IMPLICIT_SUSPICIOUS_TERMS` 命中 2+ → ≥medium+suicide_concern,3+ → high。
- 隐式(Kimi,`implicit-risk.ts decideImplicitIntercept`):pragmatic≠self 释放;`imminent_acute` 任何置信都触发危机;`plan_preparation`/`post_attempt` conf≥0.4 → 危机;`passive_death_wish`/`suicidal_ideation`/`NSSI` conf≥0.4 → suicide_concern;conf<0.4 释放。

**需要确认:**
- [ ] 这些 C-SSRS 取向的阈值/置信门槛(0.4)是否合适?over-triage(宁可报高)与 desensitization(狼来了)的平衡点在哪?
- [ ] 多源分级(词典+Kimi+量表+轨迹)合成时,各源权重 / 触发地板的阈值。

---

## §3 隐式 fail-open 政策(Kimi 超时/报错时)

**当前线上(hotfix `628275b` 后,`decideImplicitIntercept` error 分支):**
- lexicon ≥ medium → 由 lexicon 流程处理;
- lexicon == low **且挨近自杀**(suicide_concern 标志 / self_harm|suicide category)→ 保守升级 suicide_concern;
- lexicon == low **泛**(焦虑/压力/失眠)→ **释放**(fail open);
- lexicon == none → 释放。

**取舍(已知):** Kimi 超时时,词典看不出、语义又 classify 不了的 implicit-only 风险会被释放——地板对这类**不保证**(详见审计 §3/§4)。

**需要确认:**
- [ ] 这个 fail-open 政策(可用性 vs 漏报)是否可接受?Kimi 宕机时,是否需要对某些情形更保守?
- [ ] v2 目标:**确定性地板不依赖单次 LLM 调用**——正常回复是否应**始终**带一个确定性的「危险时如何找真人」最小入口,让地板永不缺席?(这是 §1 地板最小内容的延伸)

---

## §4 KB 临床内容(knowledge base)

**当前线上:** `knowledge.ts` 的 `retrieveKnowledge` 是**空桩**,永远返回 `[]`;不在安全路径上。v2 要建 KB/RAG 检索骨架。

**需要确认/提供:**
- [ ] KB 应收录哪些**被验证过的**稳定化/落地(grounding)技术、心理教育材料?(临床上恰当、不会二次伤害)
- [ ] 资源/分流逻辑(什么风险等级 → 自评/安全确认/转真人/急救)。
- [ ] 这些内容的来源与版权。

---

## §5 未成年识别(12355)措辞与触发 —— 加性修复(优先)

**当前线上的 LIVE 缺口(§0.5):** `createMinorSupportLine`(12355 青少年服务台)和 `hasMinorContextCue`(未成年语境识别)已写好、有单测,但在 `route.ts` 里**只 import 未调用**——未成年危机时只拿到成人热线,**12355 从不出现**。

**当前文案/触发(`safety.ts`):**
- `createMinorSupportLine`(line ~1079):含「全国青少年服务台 12355」「全国心理援助热线 12356」。
- `hasMinorContextCue`(line ~1091):识别在校/年级/「班主任」/「爸妈不让」/年龄 12–17 等线索。

**修复提案(§0.6,加性、下行≈0):** 在所有危机/自杀回应出口调 `hasMinorContextCue(当前消息)`,命中则**追加** `createMinorSupportLine(language)`(集中为 `withMinorSupport`)。**只增不删**成人热线。

**需要确认(4 点):**
- [ ] `12355` 是否正确/现行的青少年热线号码。
- [ ] 「找信任的成年人/老师」+ 12355 的**措辞**对未成年危机是否恰当。
- [ ] **加性(追加)** vs 替换 —— 建议加性(对误判鲁棒:成人被误判也只是多拿一条有效信息)。
- [ ] `hasMinorContextCue` 的**触发判定**可接受吗(它会漏掉不带年龄线索的未成年——属检测改进,留 v2;加性修复至少补上"已识别"那部分)。

> 因其加性、下行≈0,**这一项确认措辞后可较快上线**(工程 wiring 在分支已备/将备,签字即可接线 + 复测)。

---

## 评审流程
1. 你把本文件交给心理/精神科专业人士。
2. 他们在各 `[ ]` 处批注/修订。
3. Cowork 据反馈复测;用户点头 → 逐项灰度上线(未成年修复优先)。
