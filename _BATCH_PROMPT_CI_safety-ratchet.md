# BATCH PROMPT — 安全测试 CI 棘轮（ratchet），杜绝失败被静默

> 给 Claude Code 直接执行。背景：整整一个会话里，套件 ~84 个失败被当成「既有基线」反复 hand-wave，其中 ~70 个是**真实的安全词典缺陷**（否认自杀→危机、吞药过量→用药咨询、急性胸痛→不触发…）。CI 当时若会因此变红，第一天就拦住了。
> 但**不能直接硬红**：现在 ~70 个真失败，硬红会立刻挡住所有 PR（含 流① #3）。正确做法是**棘轮**：把当前已知失败锁成基线，只有「**新失败** / **绿转红** / **已知失败被修好却没从基线移除**」才让 CI 红。

---

## 0. 目标与分支

把当前 ❌ 失败集合冻结为 `known-failing` 基线；之后：
- 出现**不在基线里的新失败** → CI 红（防回归 / 防新缺陷溜入）。
- 原本**通过的测试变红** → CI 红。
- 基线里的某条**现在通过了** → CI 红，提示「修好了，请从基线移除」（棘轮只收紧、不松动，逼着缺陷被逐步清掉、列表不发霉）。

分支：新建 `ci-safety-ratchet`，从 `origin/main` 切出；**非危机、非应用代码**（只加 CI 与脚本），正常验证 → PR → **owner 合并**。不动 `safety.ts`、不动任何危机文案。

---

## 1. 生成基线（必须在你的环境跑真实测试 —— Cowork 跑不了：node_modules 是 macOS arm64，沙箱缺 rolldown 原生绑定）

```bash
git checkout -b ci-safety-ratchet origin/main
npm ci   # 确保依赖与锁文件一致
# 用 JSON reporter 跑全量，拿到每条测试的 pass/fail
npx vitest run --reporter=json --outputFile=safety-ci/_raw.json 2>&1 | tail -5
```

写脚本 `scripts/ci/collect-failing.mjs`：解析 `safety-ci/_raw.json`，输出**排序、稳定**的失败测试标识列表（用 `file::full test name` 作为 ID，避免顺序漂移），写入 `safety-ci/known-failing.json`：

```js
// scripts/ci/collect-failing.mjs
import { readFileSync, writeFileSync } from "node:fs";
const raw = JSON.parse(readFileSync("safety-ci/_raw.json", "utf8"));
const ids = [];
for (const f of raw.testResults ?? []) {
  for (const a of f.assertionResults ?? []) {
    if (a.status === "failed") ids.push(`${f.name.split("/").slice(-3).join("/")}::${a.fullName}`);
  }
}
ids.sort();
writeFileSync("safety-ci/known-failing.json", JSON.stringify(ids, null, 2) + "\n");
console.log(`known-failing: ${ids.length}`);
```

> 注：vitest 的 JSON 结构以你本地实际为准（字段可能是 `testResults[].assertionResults[].status/fullName`，也可能不同版本略有差异）。**先 `cat safety-ci/_raw.json | head` 看真实结构再写解析**，不要照抄字段名。目标产物就是一个排序的失败 ID 数组。

把 `_raw.json` 加进 `.gitignore`（只提交 `known-failing.json`，不提交原始大文件）。核对数量与会话报告一致（约 70 安全 + 4 死代码 + 少量环境）。

---

## 2. 棘轮检查脚本 `scripts/ci/test-ratchet.mjs`

```js
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

execSync("npx vitest run --reporter=json --outputFile=safety-ci/_raw.json", { stdio: "inherit" });
const raw = JSON.parse(readFileSync("safety-ci/_raw.json", "utf8"));
const known = new Set(JSON.parse(readFileSync("safety-ci/known-failing.json", "utf8")));

const id = (f, a) => `${f.name.split("/").slice(-3).join("/")}::${a.fullName}`;
const failing = new Set(), passing = new Set();
for (const f of raw.testResults ?? [])
  for (const a of f.assertionResults ?? [])
    (a.status === "failed" ? failing : passing).add(id(f, a));

const newlyFailing = [...failing].filter((x) => !known.has(x));         // 回归 / 新缺陷
const nowPassing  = [...known].filter((x) => passing.has(x));           // 已修好，应移出基线

let bad = false;
if (newlyFailing.length) { bad = true; console.error(`❌ NEW failures (not in baseline):\n` + newlyFailing.join("\n")); }
if (nowPassing.length)   { bad = true; console.error(`❌ These now PASS — remove from safety-ci/known-failing.json (ratchet):\n` + nowPassing.join("\n")); }
if (bad) process.exit(1);
console.log(`✅ ratchet OK — ${failing.size} known failures, no new, no silently-fixed.`);
```

`package.json` 加 `"test:ratchet": "node scripts/ci/test-ratchet.mjs"`。

---

## 3. GitHub Actions `.github/workflows/test-ratchet.yml`

```yaml
name: test-ratchet
on: [push, pull_request]
jobs:
  ratchet:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run test:ratchet
```

> 注：CI 跑在 linux x64，依赖会按平台重装（`npm ci`），不会有本地 arm64 绑定问题。

---

## 4. 自检（务必做这三步证明棘轮真的会咬）

1. **基线绿**：`npm run test:ratchet` → ✅（当前失败全部在基线内）。
2. **新失败→红**：临时在某 `*.test.ts` 加一条 `it("x", () => expect(1).toBe(2))` → 跑 → ❌ 列出该新失败 → 删除。
3. **修好未移除→红**：临时把 `known-failing.json` 里**随便一条已通过的**……不对，应反向：把一条**当前失败**的测试临时改成会通过（或从代码上修一个小的），跑 → ❌ 提示「now PASS, remove from baseline」→ 还原。

---

## 5. 提交 / PR

```bash
git add safety-ci/known-failing.json scripts/ci/*.mjs .github/workflows/test-ratchet.yml package.json .gitignore
git commit -m "ci: safety test ratchet — freeze known-failing baseline, fail on new/regressed/silently-fixed"
git log -1 --format='author=%an <%ae>'   # 必须 = AllenLi441 <245363491+AllenLi441@users.noreply.github.com>
git push origin ci-safety-ratchet
gh pr create --base main --head ci-safety-ratchet \
  --title "CI: safety test ratchet (no more silently-red safety tests)" \
  --body "Freezes the current ~84 known failures as a baseline; CI fails only on NEW failures, green→red regressions, or known-failing tests that now pass (ratchet must tighten). Does not touch app/crisis code."
```

**不要自行 merge**（owner 合并）。这是基础设施改动、非危机代码，但合并仍由 owner 拍板。

---

## 6. 回报

1. `known-failing.json` 的条数 + 分类（安全词典 / 死代码 / 环境），与会话报告核对。
2. 三步自检的输出（基线绿、新失败被抓、已修被抓）。
3. 提交作者核对行、PR 链接。
4. ⚠️ 提醒：基线里那 ~70 条**就是 v2 要修的缺陷清单**；每修好一条，棘轮会逼你把它移出基线 —— 这正是我们想要的「只减不增」。
