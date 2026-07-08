# BATCH PROMPT — 流② 增量：safety.ts 危机模板 → SSOT（逐字等价守卫）

> 给 Claude Code 直接粘贴执行。Cowork 已读完 `p3e-safety-v2` 上的真实代码、把每个号码到 SSOT 的映射核到逐字一致。
> **这是全项目最敏感的一处——线上危机文案源码。两条铁律：**
> **(1) 行为零变化 = 渲染输出逐字节相等（快照证明）。(2) 危机内容永不无临床评审上线：本增量留在分支，不开 merge PR，不上 prod。**

---

## 0. 角色与目标

你是在 `AllenLi441/ai-therapy-room`、分支 `p3e-safety-v2` 上干活的 Claude Code。
增量 1 已交付：`crisis-resources.ts`（号码单一真值源 SSOT）+ `crisis-resources.test.ts`（漂移守卫，`.toContain`）+ `overlays.tsx` CrisisSheet 已从 SSOT 取号。
**本增量目标**：把 `safety.ts` 里 4 个危机模板函数中**硬编码的热线号码**改成从 `crisis-resources.ts` 读取，**渲染输出保持逐字节不变**，并加一道**全量输出快照守卫**把这件事钉死。

**这是 behavior-preserving refactor：不新增、不删除、不改写任何一个号码或任何一句文案。只把字面量换成等值的 SSOT 引用。**

---

## 1. 背景 / 为什么

- 同一批号码以前同时硬编码在 `safety.ts`（服务端模板）和 `overlays.tsx`（UI），无共享常量——对心理健康产品是漂移风险。增量 1 建了 SSOT 并先接了 UI 侧。本增量接服务端模板侧，消除最后一份漂移。
- 现有漂移守卫只做 `.toContain(号码)`（弱：只验号码在不在，不验排版/措辞）。本增量补一道**逐字节快照**（强：整段输出必须一模一样）。
- SSOT 文件头已写明：里面是**当前线上值**，是否 canonical 由心理专业人士确认（见 `_SAFETY_v2_DRAFTS_待评审.md`）。**本增量不碰任何号码的值**，只接线。

---

## 2. 硬性护栏（违反即停手）

1. **只动 `p3e-safety-v2`**。确认 `git status` 无已跟踪改动（几个未跟踪 `_*.md` 文档正常，别动）。
2. **不 merge、不开 merge PR、不上 prod**。push 分支只触发 Vercel preview。本增量虽逐字等价，但 `p3e-safety-v2` 合并到 main 由**临床签字 + owner 点头**统一把关（整个 safety-v2 的门）。push 后只回报，**不要 `gh pr create --base main`**。
3. **提交作者必须** `AllenLi441 <245363491+AllenLi441@users.noreply.github.com>`（已配好，提交后核对）。
4. **不改任何号码的值、不改任何一句危机文案的措辞/标点/换行**。唯一允许的源码变化：字符串字面量 → 等值的模板串插值。改文案=临床评审项，不在本增量。
5. **不碰检测逻辑**：`assessRisk` 的规则、`assessConversationRisk`、`detectActiveCrisisFromHistory`、`augmentWithImplicitAccumulator`、markers 等一律不动。本增量只动 4 个**生成文案**的函数里的号码字面量。
6. **不碰** `crisis-llm.ts`、`overlays.tsx`（UI 侧增量 1 已接）、以及 流① 的 model 文件。
7. 范围**只限** `safety.ts` + 一个新增快照测试文件（+ 其 `.snap`）。

---

## 3. 做法：两个提交（先冻结，后重构）—— 这是本增量的精髓

**Commit A — 冻结当前行为（safety.ts 不动）**：先加快照测试，用当前（未重构的）`safety.ts` 输出生成 `.snap`。这样快照证明记录的是**重构前**的真实输出。

**Commit B — 重构（safety.ts 接 SSOT）**：改模板读 SSOT，重跑快照**必须零更新通过**。任何一字节 diff = 重构改了危机文案 → 修到完全相等为止。

> 顺序很重要：A 与 B 分开，才能证明「快照=旧输出」且「新代码=旧输出」。别合成一个提交。

---

## 4. 逐项改动

### 4.1 新增快照测试文件：`src/lib/safety-crisis-snapshot.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  assessRisk,
  createCrisisResponse,
  createCrisisReplyResponse,
  createMinorSupportLine,
  createSuicideConcernResponse
} from "./safety";

// v2 / 3a — BYTE-EQUIVALENCE GUARD for the SSOT refactor of safety.ts crisis
// templates. These snapshots freeze the EXACT current rendered output of every
// crisis template that embeds a hotline number. After the refactor (templates
// reading numbers from crisis-resources.ts) `vitest run` MUST pass with ZERO
// snapshot updates. Any diff = the refactor changed user-facing crisis text → fix.
//
// ⚠️ The frozen text in the .snap IS live crisis content. Changing it is a
// clinical-review item (see _SAFETY_v2_DRAFTS_待评审.md), NOT a refactor step.

const crisisAssessment = assessRisk("我真的不想活了");

describe("crisis templates — byte-equivalence snapshots (behavior lock)", () => {
  it("createCrisisResponse zh", () => {
    expect(createCrisisResponse(crisisAssessment, { language: "zh" })).toMatchSnapshot();
  });
  it("createCrisisResponse en", () => {
    expect(createCrisisResponse(crisisAssessment, { language: "en" })).toMatchSnapshot();
  });
  it("createSuicideConcernResponse zh", () => {
    expect(createSuicideConcernResponse("zh")).toMatchSnapshot();
  });
  it("createSuicideConcernResponse en", () => {
    expect(createSuicideConcernResponse("en")).toMatchSnapshot();
  });
  it("createMinorSupportLine zh", () => {
    expect(createMinorSupportLine("zh")).toMatchSnapshot();
  });
  it("createMinorSupportLine en", () => {
    expect(createMinorSupportLine("en")).toMatchSnapshot();
  });
  it("createCrisisReplyResponse escalate zh", () => {
    expect(createCrisisReplyResponse("escalate", "zh")).toMatchSnapshot();
  });
  it("createCrisisReplyResponse escalate en", () => {
    expect(createCrisisReplyResponse("escalate", "en")).toMatchSnapshot();
  });
});
```

生成 + 自检：
```bash
git checkout p3e-safety-v2
npx vitest run src/lib/safety-crisis-snapshot.test.ts -u   # 生成 .snap（来自当前 safety.ts）
npx vitest run src/lib/safety-crisis-snapshot.test.ts      # 不带 -u，确认全绿
```
打开 `src/lib/__snapshots__/safety-crisis-snapshot.test.ts.snap` 肉眼核对：含 `12356 / 110/120 / 010-82951332 / 400-161-9995 / 988 / 911 / 116 123 / 13 11 14 / 12355 / 741741 / findahelpline.com`，且整段文案与线上一致。

**Commit A**（safety.ts 一字未动）：
```bash
git add src/lib/safety-crisis-snapshot.test.ts src/lib/__snapshots__/safety-crisis-snapshot.test.ts.snap
git commit -m "流② 3a: freeze crisis-template output with byte-equivalence snapshots (no behavior change)"
```

---

### 4.2 重构 `src/lib/safety.ts`（Commit B）

**(a) 顶部加 SSOT 导入 + 派生常量**（放在现有 `import type {...} from "./types";` 之后）：

```ts
import { CN_PRIMARY_HOTLINES, CN_SUPPLEMENTAL, INTL_RESOURCES, type CrisisHotline } from "./crisis-resources";

// Crisis hotline numbers, read from the SSOT (crisis-resources.ts) so these
// server-side templates can never drift from the UI CrisisSheet. Every value below
// is byte-identical to the previously-hardcoded literal — behavior-preserving.
function cnHotline(id: CrisisHotline["id"]): string {
  const hit = CN_PRIMARY_HOTLINES.find((h) => h.id === id);
  if (!hit) throw new Error(`crisis-resources: missing hotline ${id}`);
  return hit.number;
}
const PSYCH = cnHotline("psych");      // 12356
const POLICE = cnHotline("police");    // 110
const MEDICAL = cnHotline("medical");  // 120
const CN_EMS = `${POLICE}/${MEDICAL}`; // 110/120
```

**(b) 4 个函数里的 7 处号码行：字面量 `"..."` → 等值模板串 `` `...` ``。保持缩进与行尾逗号不变。**

> `createSuicideConcernResponse` 的 **EN** 分支无号码，**不动**。

**① `createCrisisResponse` — EN（约 426 行）**
OLD:
```ts
      "1. If you already have a plan, a method nearby, or you worry you may lose control soon, call local emergency services now. In mainland China call 110/120 or the 12356 psychological support hotline; in the United States and Canada call 988 or 911.",
```
NEW:
```ts
      `1. If you already have a plan, a method nearby, or you worry you may lose control soon, call local emergency services now. In mainland China call ${CN_EMS} or the ${PSYCH} psychological support hotline; in the United States and Canada call ${INTL_RESOURCES.usCrisis} or ${INTL_RESOURCES.usEmergency}.`,
```

**② `createCrisisResponse` — ZH（约 449 行）**
OLD:
```ts
    "1. 如果你已经有明确计划、工具在身边，或担心自己马上会失控，请立刻拨打当地急救电话。中国大陆可拨打 110/120，也可以拨打全国心理援助热线 12356；北京心理援助热线 010-82951332、希望24热线 400-161-9995 也可作为补充尝试。美国和加拿大可拨打 988 或 911。",
```
NEW:
```ts
    `1. 如果你已经有明确计划、工具在身边，或担心自己马上会失控，请立刻拨打当地急救电话。中国大陆可拨打 ${CN_EMS}，也可以拨打全国心理援助热线 ${PSYCH}；北京心理援助热线 ${CN_SUPPLEMENTAL.beijing}、希望24热线 ${CN_SUPPLEMENTAL.hope24} 也可作为补充尝试。美国和加拿大可拨打 ${INTL_RESOURCES.usCrisis} 或 ${INTL_RESOURCES.usEmergency}。`,
```

**③ `createSuicideConcernResponse` — ZH（约 539 行）**
OLD:
```ts
    "先不急着分析为什么这么痛，先确认眼前安全。如果你已经有计划、工具在身边，或者担心自己会控制不住，请现在就联系急救服务，或者让身边可信赖的人过来陪你。中国大陆可拨打 110/120，也可以拨打全国心理援助热线 12356；北京心理援助热线 010-82951332、希望24热线 400-161-9995 也可作为补充尝试。如果还没有明确计划，也不要一个人扛，给现实中可信赖的人发一句：我今晚不太安全，不想一个人待着。",
```
NEW:
```ts
    `先不急着分析为什么这么痛，先确认眼前安全。如果你已经有计划、工具在身边，或者担心自己会控制不住，请现在就联系急救服务，或者让身边可信赖的人过来陪你。中国大陆可拨打 ${CN_EMS}，也可以拨打全国心理援助热线 ${PSYCH}；北京心理援助热线 ${CN_SUPPLEMENTAL.beijing}、希望24热线 ${CN_SUPPLEMENTAL.hope24} 也可作为补充尝试。如果还没有明确计划，也不要一个人扛，给现实中可信赖的人发一句：我今晚不太安全，不想一个人待着。`,
```

**④ `createMinorSupportLine` — EN（约 1083 行）** ⚠️ `741741`（Crisis Text Line）不在 SSOT，**保留字面量不动**，只接 988 与 findahelpline。
OLD:
```ts
      "Youth help: in the US/Canada call or text 988, or text HOME to 741741 (Crisis Text Line). Elsewhere, find a local youth line at findahelpline.com."
```
NEW:
```ts
      `Youth help: in the US/Canada call or text ${INTL_RESOURCES.usCrisis}, or text HOME to 741741 (Crisis Text Line). Elsewhere, find a local youth line at ${INTL_RESOURCES.finder}.`
```

**⑤ `createMinorSupportLine` — ZH（约 1088 行）**
OLD:
```ts
    "面向未成年人的求助：全国青少年服务台 12355（共青团心理援助），以及全国心理援助热线 12356。"
```
NEW:
```ts
    `面向未成年人的求助：全国青少年服务台 ${CN_SUPPLEMENTAL.youth}（共青团心理援助），以及全国心理援助热线 ${PSYCH}。`
```

**⑥ `createCrisisReplyResponse` — EN escalate（约 1104 行）**
OLD:
```ts
        "Please do this now: call emergency or a crisis line, or reach someone who can come to you. US/Canada 988 or 911; UK/Ireland 116 123 (Samaritans); Australia 13 11 14 (Lifeline); mainland China 110/120 or 12356; elsewhere findahelpline.com.",
```
NEW:
```ts
        `Please do this now: call emergency or a crisis line, or reach someone who can come to you. US/Canada ${INTL_RESOURCES.usCrisis} or ${INTL_RESOURCES.usEmergency}; UK/Ireland ${INTL_RESOURCES.ukSamaritans} (Samaritans); Australia ${INTL_RESOURCES.auLifeline} (Lifeline); mainland China ${CN_EMS} or ${PSYCH}; elsewhere ${INTL_RESOURCES.finder}.`,
```

**⑦ `createCrisisReplyResponse` — ZH escalate（约 1124 行）**
OLD:
```ts
      "请现在就做：拨打急救或危机热线，或联系一个能马上到场的人。中国大陆 110/120，或全国心理援助热线 12356；美国/加拿大 988 或 911；英国/爱尔兰 116 123；澳洲 13 11 14；其他地区可在 findahelpline.com 找当地热线。",
```
NEW:
```ts
      `请现在就做：拨打急救或危机热线，或联系一个能马上到场的人。中国大陆 ${CN_EMS}，或全国心理援助热线 ${PSYCH}；美国/加拿大 ${INTL_RESOURCES.usCrisis} 或 ${INTL_RESOURCES.usEmergency}；英国/爱尔兰 ${INTL_RESOURCES.ukSamaritans}；澳洲 ${INTL_RESOURCES.auLifeline}；其他地区可在 ${INTL_RESOURCES.finder} 找当地热线。`,
```

> 映射核对（必须逐字相等）：`CN_EMS`=110/120 · `PSYCH`=12356 · `CN_SUPPLEMENTAL.beijing`=010-82951332 · `CN_SUPPLEMENTAL.hope24`=400-161-9995 · `CN_SUPPLEMENTAL.youth`=12355 · `INTL_RESOURCES.usCrisis`=988 · `usEmergency`=911 · `ukSamaritans`=116 123 · `auLifeline`=13 11 14 · `finder`=findahelpline.com。

---

## 5. 验证（Commit B 后）

```bash
npx tsc --noEmit                                       # 0 error
npx vitest run src/lib/safety-crisis-snapshot.test.ts  # 必须零快照更新通过（核心证明）
npx vitest run src/lib/crisis-resources.test.ts        # 增量1漂移守卫仍绿
npx vitest run 2>&1 | tail -5                           # 全量：passed 不低于基线+8、failed 不高于基线
npm run build                                           # 绿
```
- 若快照测试报任何 diff：说明重构改了输出 → 对照第 4.2 映射修到逐字相等，**绝不用 `-u` 抹掉差异**（那等于偷偷改危机文案）。
- 基线：先在动手前 `npx vitest run` 记 p3e-safety-v2 当前 passed/failed（增量1后约 226 passed / 84 failed，以实跑为准）。本增量预期：passed +8（新快照）、failed 不变。

**Commit B**（只含 safety.ts）：
```bash
git add src/lib/safety.ts
git commit -m "流② 3a: route safety.ts crisis templates to crisis-resources SSOT (byte-equal; snapshots unchanged)"
git log -2 --format='author=%an <%ae>'   # 两个提交都必须 = AllenLi441 <245363491+AllenLi441@users.noreply.github.com>
git push origin p3e-safety-v2             # 仅 preview，不动 prod
```

**不要开 merge PR。** 危机代码合并到 main 由临床签字统一把关。

---

## 6. 回报格式（给 owner）

1. 两个提交的 `git show --stat`（A=测试+snap，B=safety.ts）。
2. 关键证明：重构后 `safety-crisis-snapshot.test.ts` **零更新通过**的 vitest 输出。
3. 全量 vitest 基线 vs 现在（passed/failed）、`tsc`、`npm run build` 结果。
4. 两个提交的作者核对行。
5. Vercel preview URL。
6. 明确声明：**未开 merge PR、prod 仍 `9d4b95b`**。
7. 旗标：`741741`（Crisis Text Line，仅出现在 EN 未成年行）未进 SSOT，本次保留字面量——建议作为「把现存值编入 SSOT」的待办，**需临床确认**后再收编（属 `_SAFETY_v2_DRAFTS_待评审.md` 范畴）。

---

## 7. 本增量**不做**（流② 后续，各自独立 + 临床门）

- `3b` 多源分级 + 检测/回应解耦（仅影子，不接线上）。
- KB 骨架、影子运行 harness。
- `withMinorSupport` 加性接线（12355，文案待临床签字）。
- 任何危机**文案/阈值/号码值**的改动——全部进 `_SAFETY_v2_DRAFTS_待评审.md`，**心理老师签字 + owner 点头**才上线。
- 把 `741741` 等现存字面量收编进 SSOT（需临床确认后另起增量）。
