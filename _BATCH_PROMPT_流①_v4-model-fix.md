# BATCH PROMPT — 流① 模型名修复（deep/fast → DeepSeek v4 真名）

> 给 Claude Code 直接粘贴执行。Cowork 已做完调研 + 定好逐行 diff；你（CC）负责落地、验证、提交、推送、开 PR。
> **生产铁律：prod 冻结在 `9d4b95b`，本任务只动分支 `p3d-stream1`，绝不 merge 到 main。**

---

## 0. 角色与目标

你是在 `AllenLi441/ai-therapy-room` 仓库里干活的 Claude Code。
**目标**：把 `p3d-stream1` 上「深度/快速」档用的 DeepSeek 模型名，从已废弃且其实选错的 `deepseek-reasoner`/`deepseek-chat`，换成当前正确的 `deepseek-v4-pro`（深度）/ `deepseek-v4-flash`（快速），并把思考模式、超时、max_tokens 一并接对。**只在分支做，不合并。**

owner（Allen）已拍板：**深度 = `deepseek-v4-pro`**（真·强模型，接受其更慢更贵，延迟在 prod A/B 实测）。

---

## 1. 为什么（已核实的事实，2026-06-15 查 DeepSeek 官方文档）

- 当前 API 模型只有两个：`deepseek-v4-flash`（快）和 `deepseek-v4-pro`（1.6T 推理档）。两者都支持思考/非思考模式，**默认思考开**。
- `deepseek-chat` / `deepseek-reasoner` 是**遗留别名，2026-07-24 15:59 UTC 弃用**；二者分别等于 `deepseek-v4-flash` 的**非思考 / 思考**模式。
- 也就是说：分支现在 deep→`deepseek-reasoner` 拿到的根本不是强模型，而是 **v4-flash 的思考模式**。这是真 bug，不是改名。要拿强模型**必须显式用 `deepseek-v4-pro`**。
- 思考开关参数（OpenAI 格式，未变）：`{"thinking": {"type": "enabled" | "disabled"}}`，默认 `enabled`。可选 `reasoning_effort`，默认 `high`，本次不设。
- 思考模式下 CoT（`reasoning_content`）与最终答案 `content` 同级返回，**CoT 计入 `max_tokens`**。本仓库的流解析器只读 `delta.content`，会自动丢弃 CoT —— 行为正确（治疗 UI 不显示 CoT），但意味着 deep 档若 `max_tokens` 太小，CoT 会把可见答案挤没 → 读起来像「卡住/坏了」。故 deep 档 `max_tokens` 由 1600 提到 **8192**（只是上限，不会拖慢普通回复）。
- 价格（/1M tokens，供 A/B 成本心里有数）：v4-flash 输入$0.14/输出$0.28；v4-pro 输入$0.435/输出$0.87（≈3.1×）。
- 来源：api-docs.deepseek.com 的 Models&Pricing、Thinking Mode 两页。

---

## 2. 硬性护栏（违反即停手）

1. **只动 `p3d-stream1`**。先 `git checkout p3d-stream1`，确认 `git status` 无**已跟踪**改动（仅有几个未跟踪的 `_*.md` 文档属正常，别动）。
2. **不 merge、不动 main、不碰 prod**。push 分支只会触发 Vercel **preview**，不会动生产。合并走 GitHub PR，由 owner 批。
3. **提交作者必须** `AllenLi441 <245363491+AllenLi441@users.noreply.github.com>`（仓库已配好，提交后**核对一次**，否则 Vercel Block）。
4. **绝不碰危机/安全代码**（那是 流②，必须临床评审才上线）：不要改 `src/lib/safety.ts`、`src/lib/crisis-resources.ts`、`src/lib/crisis-llm.ts`、`src/components/jingshi/overlays.tsx`。
5. **绝不碰那套已死的 API-B**：不要改 `DEEPSEEK_MODEL_OPTIONS`、`resolveDeepSeekModel`、v5.5 相关、`toDeepSeekApiModel`、`src/lib/model-api-mapping.test.ts`。那是「UI 选模型 vs 选 pace」未决的另一摊事，本任务不掺和。
6. 改动**只限**下列 5 个文件，且**只做下列 diff**，不要顺手重构别的。

---

## 3. 逐行改动（OLD → NEW，照抄）

### 文件 1：`src/lib/model-options.ts`

**1a — 顶部注释块（开头 6 行）**

OLD:
```ts
// The chat always talks to ONE real DeepSeek model (deepseek-chat by default;
// override with the DEEPSEEK_MODEL env var). The picker in the UI does NOT choose
// a model — it chooses the SESSION PACE, i.e. how much of our own pipeline runs:
//   deep → full plan + review pipeline (more considered, a little slower)
//   fast → skip the review pass for a quicker reply
// Both paces use the same underlying model.
```
NEW:
```ts
// The chat talks to a real DeepSeek model chosen by SESSION PACE:
//   deep → deepseek-v4-pro   + full plan/review pipeline (more considered, slower)
//   fast → deepseek-v4-flash + skip the review pass (quicker)
// The env var DEEPSEEK_MODEL still sets the model for non-pace callers (e.g. the
// summary route) and as a fallback; it defaults to the fast tier.
```

**1b — `DEFAULT_DEEPSEEK_API_MODEL` + `VALID_API_MODELS`**

OLD:
```ts
// The real DeepSeek API model name. Driven entirely by env; never coerced to a UI
// label, so DEEPSEEK_MODEL=deepseek-chat (or deepseek-reasoner) reaches the API as-is.
export const DEFAULT_DEEPSEEK_API_MODEL = "deepseek-chat";

// The real DeepSeek chat-completions API only accepts "deepseek-chat" (fast) and
// "deepseek-reasoner" (slow, reasoning). Any other value — including the UI labels
// our .env.example used to suggest ("deepseek-v4-pro" …) — would 400 and make the
// chat fall back, which reads as being slow/broken. So coerce anything unknown to
// the fast default instead of trusting a stale env value.
const VALID_API_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);
```
NEW:
```ts
// The real DeepSeek API model name (env-driven; used by the summary route and as
// the chat fallback). Defaults to the cheap fast tier.
export const DEFAULT_DEEPSEEK_API_MODEL = "deepseek-v4-flash";

// The current DeepSeek API models are "deepseek-v4-flash" (fast) and
// "deepseek-v4-pro" (the 1.6T reasoning tier). The legacy aliases "deepseek-chat"
// /"deepseek-reasoner" are deprecated 2026-07-24 (both map to v4-flash's
// non-thinking/thinking modes), so we standardize on the v4 names and coerce
// anything unknown to the fast default rather than 400 the provider.
const VALID_API_MODELS = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);
```

**1c — `resolveApiModelForPace`**

OLD:
```ts
// The deep/fast toggle now selects a REAL model: deep = the reasoning model
// (deeper, slower), fast = the standard chat model (quicker). Both are valid
// DeepSeek API model names (unlike the stale "deepseek-v4-*" UI labels).
export function resolveApiModelForPace(pace: unknown): string {
  return resolveSessionPace(pace) === "fast" ? "deepseek-chat" : "deepseek-reasoner";
}
```
NEW:
```ts
// The deep/fast toggle selects a REAL model: deep = deepseek-v4-pro (the 1.6T
// reasoning model, deeper + slower + pricier), fast = deepseek-v4-flash (quicker,
// cheaper). Both are current DeepSeek API model names.
export function resolveApiModelForPace(pace: unknown): string {
  return resolveSessionPace(pace) === "fast" ? "deepseek-v4-flash" : "deepseek-v4-pro";
}
```

> ⚠️ 改完后 `VALID_API_MODELS` 必含 v4 名字，否则 chat route 传进来的 `deepseek-v4-pro` 会被 `isValidApiModel` 判无效而回退到 env 默认 —— 整个修复就白做了。这条是 1b 改动的关键原因。

---

### 文件 2：`src/lib/deepseek.ts`

**2a — `DeepSeekPayload` 的 `thinking` 类型**

OLD:
```ts
  // Only sent for the standard chat model. deepseek-reasoner reasons inherently
  // and rejects/ignores a thinking-disable, so we omit it there.
  thinking?: {
    type: "disabled";
  };
```
NEW:
```ts
  // Thinking-mode toggle (DeepSeek defaults to enabled). We set it explicitly:
  // deep tier (v4-pro) → enabled (reasons before answering); fast tier (v4-flash)
  // → disabled (quicker, no chain-of-thought).
  thinking?: {
    type: "enabled" | "disabled";
  };
```

**2b — `buildDeepSeekPayload` 入参注释**

OLD:
```ts
  apiModel?: string;              // real API model: deepseek-chat | deepseek-reasoner
```
NEW:
```ts
  apiModel?: string;              // real API model: deepseek-v4-pro | deepseek-v4-flash
```

**2c — `buildDeepSeekPayload` 主体（model / isReasoner / max_tokens / thinking）**

OLD:
```ts
  // The real API model: an explicit, VALID apiModel (the deep/fast → reasoner/chat
  // choice) overrides the env default. Unknown values fall back to env so a bad
  // value never 400s the provider. The stale UI-label ids ("deepseek-v4-pro" …)
  // are NOT valid API names and would 400 — never send them.
  const model = isValidApiModel(input.apiModel) ? input.apiModel : getDeepSeekConfig().model;
  const isReasoner = model === "deepseek-reasoner";

  return {
    model,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...normalizeConversationForProvider(input.messages)
    ],
    temperature: 0.5,
    // reasoner spends tokens on the hidden chain-of-thought too, so give it room.
    max_tokens: input.maxTokens ?? (isReasoner ? 1600 : 900),
    stream: input.stream ?? true,
    // reasoner reasons inherently — omit the thinking-disable it would reject.
    ...(isReasoner ? {} : { thinking: { type: "disabled" as const } })
  } satisfies DeepSeekPayload;
```
NEW:
```ts
  // The real API model: an explicit, VALID apiModel (the deep/fast → v4-pro/v4-flash
  // choice) overrides the env default. Unknown values fall back to env so a bad
  // value never 400s the provider.
  const model = isValidApiModel(input.apiModel) ? input.apiModel : getDeepSeekConfig().model;
  const isDeepThinking = model === "deepseek-v4-pro";

  return {
    model,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...normalizeConversationForProvider(input.messages)
    ],
    temperature: 0.5,
    // The thinking tier spends tokens on the hidden chain-of-thought too (counts
    // toward max_tokens), so give it room for CoT + a full answer.
    max_tokens: input.maxTokens ?? (isDeepThinking ? 8192 : 900),
    stream: input.stream ?? true,
    // deep → think before answering; fast → no chain-of-thought, quicker reply.
    thinking: { type: isDeepThinking ? "enabled" : "disabled" }
  } satisfies DeepSeekPayload;
```

**2d — `requestDeepSeek` 超时**

OLD:
```ts
  // deepseek-reasoner thinks before any token and can take 15-40s; 30s would
  // often abort it (→ fallback, reads as broken). Keep it under route maxDuration (60s).
  const timeoutMs = payload.model === "deepseek-reasoner" ? 55_000 : 30_000;
```
NEW:
```ts
  // deepseek-v4-pro thinks before any token and can take tens of seconds; 30s
  // would often abort it (→ fallback, reads as broken). Keep it under the route
  // maxDuration (60s).
  const timeoutMs = payload.model === "deepseek-v4-pro" ? 55_000 : 30_000;
```

---

### 文件 3：`src/lib/deepseek.test.ts`

**3a — env 透传用例**

OLD:
```ts
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-reasoner");
```
（同一 `it(...)` 内）
OLD:
```ts
    expect(payload.model).toBe("deepseek-reasoner");
```
NEW（分别）:
```ts
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-pro");
```
```ts
    expect(payload.model).toBe("deepseek-v4-pro");
```

**3b — pace 映射用例**

OLD:
```ts
  it("maps pace to a VALID API model: deep→reasoner, fast→chat, default→deep", () => {
    expect(resolveApiModelForPace("deep")).toBe("deepseek-reasoner");
    expect(resolveApiModelForPace("fast")).toBe("deepseek-chat");
    expect(resolveApiModelForPace(undefined)).toBe("deepseek-reasoner");
  });
```
NEW:
```ts
  it("maps pace to a VALID API model: deep→v4-pro, fast→v4-flash, default→deep", () => {
    expect(resolveApiModelForPace("deep")).toBe("deepseek-v4-pro");
    expect(resolveApiModelForPace("fast")).toBe("deepseek-v4-flash");
    expect(resolveApiModelForPace(undefined)).toBe("deepseek-v4-pro");
  });
```

**3c — payload 尊重 apiModel 用例**

OLD:
```ts
  it("payload honors a valid apiModel; reasoner omits thinking + gets more tokens", () => {
    vi.stubEnv("DEEPSEEK_MODEL", "");
    const reasoner = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-reasoner" });
    expect(reasoner.model).toBe("deepseek-reasoner");
    expect(reasoner.thinking).toBeUndefined();
    expect(reasoner.max_tokens).toBeGreaterThan(900);

    const chat = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-chat" });
    expect(chat.model).toBe("deepseek-chat");
    expect(chat.thinking).toEqual({ type: "disabled" });
  });
```
NEW:
```ts
  it("payload honors a valid apiModel; deep (v4-pro) thinks + gets more tokens", () => {
    vi.stubEnv("DEEPSEEK_MODEL", "");
    const deep = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-v4-pro" });
    expect(deep.model).toBe("deepseek-v4-pro");
    expect(deep.thinking).toEqual({ type: "enabled" });
    expect(deep.max_tokens).toBeGreaterThan(900);

    const fast = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-v4-flash" });
    expect(fast.model).toBe("deepseek-v4-flash");
    expect(fast.thinking).toEqual({ type: "disabled" });
  });
```

**3d — 非法 apiModel 回退用例（注意：旧用例把 `deepseek-v4-pro` 当「非法」，现已反转）**

OLD:
```ts
  it("a bogus apiModel falls back to the safe default — never sent to the API", () => {
    vi.stubEnv("DEEPSEEK_MODEL", "");
    const payload = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-v4-pro" });
    expect(payload.model).toBe("deepseek-chat");
  });
```
NEW:
```ts
  it("a bogus apiModel falls back to the safe default — never sent to the API", () => {
    vi.stubEnv("DEEPSEEK_MODEL", "");
    const payload = buildDeepSeekPayload({ systemPrompt: "s", messages: [u("hi")], apiModel: "deepseek-reasoner" });
    expect(payload.model).toBe("deepseek-v4-flash");
  });
```

**3e — normalize 用例里的 env stub（清理用，可选但建议）**

OLD:
```ts
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v5.5-flash");
```
NEW:
```ts
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-flash");
```

---

### 文件 4：`src/app/api/chat/route.ts`（仅注释）

OLD:
```ts
    apiModel: resolveApiModelForPace(body.pace), // deep→reasoner, fast→chat
```
NEW:
```ts
    apiModel: resolveApiModelForPace(body.pace), // deep→v4-pro, fast→v4-flash
```

---

### 文件 5：`.env.example`（第 5 行，保持 summary 走便宜档）

OLD:
```
DEEPSEEK_MODEL=deepseek-v4-pro
```
NEW:
```
# Model for the summary route + chat fallback only. The chat deep/fast tiers are
# chosen by session pace (v4-pro / v4-flash) regardless of this value.
DEEPSEEK_MODEL=deepseek-v4-flash
```

> 真·env（Vercel / `.env.local`）由 owner 控制；提醒 owner：把 `DEEPSEEK_MODEL` 设成 `deepseek-v4-flash` 可让 summary 路由用便宜档。

---

## 4. 验证（每步必须绿/不回退）

```bash
git checkout p3d-stream1
git status                      # 仅未跟踪 _*.md 属正常；无已跟踪改动再继续

# 先记基线（注意：是 p3d-stream1 自己的基线，不是 p3e 的 84/226）
npx vitest run 2>&1 | tail -5   # 记下 passed / failed 数

# —— 按第 3 节改 5 个文件 ——

npx tsc --noEmit                # 必须 0 error
npx vitest run src/lib/deepseek.test.ts   # 改动的用例全过
npx vitest run 2>&1 | tail -5   # 全量：passed 不得低于基线、failed 不得高于基线
npm run build                   # 必须绿
```

不达标就停手报告，别硬提交。`model-api-mapping.test.ts` 若本来就红（`toDeepSeekApiModel` 未定义）属既有基线，**别去修它**（API-B，越界）。

---

## 5. 提交 / 推送 / PR

```bash
git add src/lib/model-options.ts src/lib/deepseek.ts src/lib/deepseek.test.ts \
        src/app/api/chat/route.ts .env.example
git commit -m "流① fix: deep/fast → deepseek-v4-pro / deepseek-v4-flash (current API names)

- resolveApiModelForPace: deep→deepseek-v4-pro, fast→deepseek-v4-flash
- VALID_API_MODELS + default → v4 names; drop legacy chat/reasoner
  (deprecated 2026-07-24, both alias v4-flash)
- deepseek.ts: thinking enabled for v4-pro / disabled for v4-flash;
  timeout keyed on v4-pro; deep max_tokens 1600→8192 so CoT can't starve the answer
- tests updated to the v4 names
Fixes deep tier silently using deepseek-reasoner (= v4-flash thinking), never the
strong model. Branch only; NOT merged — prod stays 9d4b95b."

git log -1 --format='author=%an <%ae>'   # 必须 = AllenLi441 <245363491+AllenLi441@users.noreply.github.com>
git push origin p3d-stream1               # 触发 Vercel PREVIEW（非 prod）
```

然后用 `gh` 开 PR（**不要 merge**）：
```bash
gh pr create --base main --head p3d-stream1 \
  --title "流① deep/fast → DeepSeek v4 model names (DO NOT MERGE — owner + latency A/B gate)" \
  --body "Switches the deep/fast tiers to deepseek-v4-pro / deepseek-v4-flash and re-keys thinking/timeout/max_tokens. Branch-only; awaiting owner sign-off + prod A/B on deep-tier latency before merge."
```

---

## 6. 回报格式（给 owner）

1. 改动文件清单 + `git show --stat HEAD`。
2. 验证结果：`tsc` error 数、`vitest` 基线 vs 改后 passed/failed、`npm run build` 结果。
3. 提交作者核对行。
4. Vercel preview URL。
5. PR 链接（未合并）。
6. ⚠️ 留给 owner 决策：(a) deep 档延迟 —— v4-pro 思考可能 >15-40s，preview 里**实测**首字延迟报个数；(b) deep `max_tokens=8192` 是否合适（CoT 挤答案的风险旋钮）；(c) 默认 pace = deep = v4-pro = 约 3.1× 成本，是否要把默认改 fast。

---

## 7. 本任务**不做**的事（下一个独立 prompt 再说）

- 流② `safety.ts → SSOT`（危机模板单一真值源 + 快照/逐字等价守卫）：在 `p3e-safety-v2`，**永不无临床评审上线**，单独 prompt。
- API-B / v5.5 / `toDeepSeekApiModel` 的死代码清理：owner 先定「UI 选模型 vs 选 pace」再说。
- 任何危机文案/阈值/未成年接线：要心理老师签字（见 `_SAFETY_v2_DRAFTS_待评审.md`）。
