import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import type { UnifiedLabel } from "../adapters/result";

export const RUN_ARMS = ["lexicon", "judge", "pipeline_fast", "pipeline_deep"] as const;
export type UnitKey = { id: string; turn: number; gold: UnifiedLabel };
export type ResultRow = UnitKey & { runId?: string; prediction: UnifiedLabel | null; error?: string; branch?: string | null };

export function runPaths(appRoot: string, runId: string) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(runId)) throw new Error("--run-id 仅允许小写字母、数字、下划线和连字符，长度 1–64");
  const root = join(resolve(appRoot), "eval/.workdir/runs", runId);
  return { root, results: join(root, "results"), reports: join(root, "reports"), workdir: join(root, "workdir"), manifest: join(root, "manifest.json") };
}

export function assertKnownRun(paths: ReturnType<typeof runPaths>, create: boolean) {
  if (!existsSync(paths.manifest)) {
    if (!create || (existsSync(paths.root) && readdirSync(paths.root).length > 0)) {
      throw new Error("run 缺少 manifest 或包含未知文件；请另起 run-id，勿混入旧结果");
    }
  }
  if (existsSync(paths.results) && readdirSync(paths.results).some((f) => !RUN_ARMS.some((a) => f === `${a}.jsonl`))) {
    throw new Error("run results 包含未知文件；拒绝汇总或继续执行");
  }
}

function git(appRoot: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: appRoot, encoding: "utf8" }).trim();
}

export function inputSnapshot(appRoot: string, datasetDirs: string[] = ["safety", "multiturn"]) {
  const hashFiles = (files: string[]) => Object.fromEntries([...new Set(files)].sort().map((file) =>
    [file, createHash("sha256").update(readFileSync(join(appRoot, file))).digest("hex")]));
  const datasetFiles = datasetDirs.flatMap((dir) =>
    readdirSync(join(appRoot, "eval/datasets", dir)).filter((f) => f.endsWith(".jsonl")).map((f) => `eval/datasets/${dir}/${f}`));
  // Bound discovery to application/evaluation source; no dependencies or outputs.
  const sourceFiles = git(appRoot, "ls-files", "-co", "--exclude-standard", "-z", "--", "src", "eval/adapters", "eval/experiments", "package-lock.json", "tsconfig.json")
    .split("\0").filter((f) => /\.(?:tsx?|json)$/.test(f) && !f.includes("/results/"));
  return { sourceCommit: git(appRoot, "rev-parse", "HEAD"), datasetSha256: hashFiles(datasetFiles), sourceSha256: hashFiles(sourceFiles) };
}

export function freezeManifest(paths: ReturnType<typeof runPaths>, protocol: object) {
  if (existsSync(paths.manifest)) {
    const stored = JSON.parse(readFileSync(paths.manifest, "utf8"));
    if (JSON.stringify(stored.protocol) !== JSON.stringify(protocol)) throw new Error("run 的数据、源码或模型配置已改变；请另起 run-id");
    return stored;
  }
  mkdirSync(paths.root, { recursive: true });
  const manifest = { createdAt: new Date().toISOString(), protocol };
  writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return manifest;
}

/** One lock for every run and every worktree of this repository. Never steal a
 * stale lock automatically; SIGKILL recovery needs the recorded PID checked. */
export function acquireRunLock(appRoot: string, runId: string) {
  const common = resolve(appRoot, git(appRoot, "rev-parse", "--git-common-dir"));
  const file = join(common, "jingshi-detection-eval.lock");
  const owner = JSON.stringify({ pid: process.pid, runId, startedAt: new Date().toISOString() });
  try { writeFileSync(file, owner, { flag: "wx" }); }
  catch { throw new Error(`另一评测持有锁 ${file}；先核对其 PID，禁止并发或自动抢锁`); }
  let released = false;
  return () => {
    if (!released && existsSync(file) && readFileSync(file, "utf8") === owner) unlinkSync(file);
    released = true;
  };
}

export function readRows(file: string): ResultRow[] {
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
}

export function validateRows(rows: ResultRow[], units: UnitKey[], runId: string, wholeConversations = false) {
  const expected = new Map(units.map((u) => [`${u.id}#${u.turn}`, u]));
  if (expected.size !== units.length) throw new Error("数据集存在重复单元");
  const done = new Set<string>();
  for (const row of rows) {
    const key = `${row.id}#${row.turn}`;
    if (done.has(key) || row.runId !== runId || !expected.has(key) || expected.get(key)?.gold !== row.gold ||
        (row.prediction !== null && !["none", "passive_ideation", "active_ideation", "crisis"].includes(row.prediction)) ||
        (row.error && row.prediction !== null)) throw new Error(`结果污染或重复/无效单元 ${key}；请另起 run-id`);
    done.add(key);
  }
  if (wholeConversations) {
    const started = new Set(rows.map((r) => r.id));
    if (units.some((u) => started.has(u.id) && !done.has(`${u.id}#${u.turn}`))) throw new Error("run 包含未完成的多轮会话；请另起 run-id，禁止静默跳过或追加重复轮");
  }
  return done;
}

/** Only structured classifier fields; no credentials, provider error bodies,
 * free-form rationale, raw prompts, conversation text or generated replies. */
export function decisionAudit(log: unknown) {
  const pick = (value: unknown, fields: string[]) => value && typeof value === "object"
    ? Object.fromEntries(fields.filter((key) => key in value).map((key) => [key, (value as Record<string, unknown>)[key]])) : null;
  const entry = log as Record<string, unknown> | null;
  return {
    lexicon: pick(entry?.lexicon, ["level", "flags", "categories", "matchedTerms"]),
    implicit: pick(entry?.implicit, ["kind", "level", "severity", "pragmatic", "modifiers", "confidence", "judgedBy", "fallbackReason"]),
    implicitDecision: pick(entry?.implicitDecision, ["intercept", "mode", "source"]),
    crisisModeActive: entry?.crisisModeActive === true,
  };
}
