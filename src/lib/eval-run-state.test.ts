import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { acquireRunLock, assertKnownRun, decisionAudit, freezeManifest, readRows, runPaths, validateRows, type ResultRow } from "../../eval/experiments/run-state";

const temporary: string[] = [];
const root = () => { const dir = mkdtempSync(join(tmpdir(), "jingshi-eval-test-")); temporary.push(dir); return dir; };
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const units = [{ id: "a", turn: 0, gold: "none" as const }, { id: "a", turn: 1, gold: "crisis" as const }, { id: "b", turn: 0, gold: "none" as const }];
const rows = (): ResultRow[] => units.map((u) => ({ ...u, runId: "fresh", prediction: u.gold }));

describe("isolated safety evaluation runs", () => {
  it("rejects traversal names and keeps all run artifacts outside historical output paths", () => {
    const dir = root(), first = runPaths(dir, "fresh"), second = runPaths(dir, "next");
    for (const name of ["../old", "a/b", "", "A", "a".repeat(65)]) expect(() => runPaths(dir, name)).toThrow();
    for (const path of [first.results, first.reports, first.workdir, first.manifest]) expect(path.startsWith(first.root + "/")).toBe(true);
    expect(first.root).not.toBe(second.root);
    expect(first.results).not.toBe(join(dir, "eval/experiments/results"));
  });

  it("refuses an unknown run, unmanifested files, and unexpected result files", () => {
    const paths = runPaths(root(), "fresh");
    expect(() => assertKnownRun(paths, false)).toThrow("缺少 manifest");
    expect(() => assertKnownRun(paths, true)).not.toThrow();
    mkdirSync(paths.root, { recursive: true });
    writeFileSync(join(paths.root, "old.jsonl"), "{}");
    expect(() => assertKnownRun(paths, true)).toThrow("未知文件");
    freezeManifest(paths, { runId: "fresh" });
    mkdirSync(paths.results);
    writeFileSync(join(paths.results, "annotator_A.jsonl"), "{}");
    expect(() => assertKnownRun(paths, false)).toThrow("未知文件");
  });

  it("freezes inputs without overwriting a changed dataset, source or provider", () => {
    const paths = runPaths(root(), "fresh");
    const protocol = { dataSha: "a", sourceSha: "b", provider: "moonshot" };
    freezeManifest(paths, protocol);
    const original = readFileSync(paths.manifest, "utf8");
    expect(() => freezeManifest(paths, protocol)).not.toThrow();
    for (const key of Object.keys(protocol)) expect(() => freezeManifest(paths, { ...protocol, [key]: "changed" })).toThrow("已改变");
    expect(readFileSync(paths.manifest, "utf8")).toBe(original);
  });

  it("requires complete conversations for resume while allowing unstarted conversations", () => {
    expect(validateRows(rows().slice(0, 2), units, "fresh", true).size).toBe(2);
    expect(validateRows([], units, "fresh", true).size).toBe(0);
    expect(() => validateRows(rows().slice(0, 1), units, "fresh", true)).toThrow("未完成的多轮");
  });

  it("rejects duplicate, unknown, relabeled and foreign-run rows", () => {
    for (const bad of [
      [...rows(), rows()[0]], [{ ...rows()[0], id: "unknown" }], [{ ...rows()[0], gold: "crisis" as const }],
      [{ ...rows()[0], runId: "old" }], [{ ...rows()[0], prediction: undefined }], [{ ...rows()[0], error: "failed" }],
    ]) expect(() => validateRows(bad as ResultRow[], units, "fresh")).toThrow("污染");
    const failed = [{ ...rows()[2], prediction: null, error: "judge_unavailable" }];
    expect(validateRows(failed, units, "fresh", true).size).toBe(1); // failure is kept, not reclassified as none
  });

  it("does not hide malformed JSON from a partial append", () => {
    const file = join(root(), "partial.jsonl");
    writeFileSync(file, JSON.stringify(rows()[0]) + '\n{"id":');
    expect(() => readRows(file)).toThrow();
  });

  it("allows only one run lock at a time and cleans it idempotently", () => {
    const dir = root();
    execFileSync("git", ["init", "-q", dir]);
    const release = acquireRunLock(dir, "first");
    try { expect(() => acquireRunLock(dir, "second")).toThrow("持有锁"); }
    finally { release(); release(); }
    acquireRunLock(dir, "second")();
  });

  it("retains routing evidence without free-form provider errors or conversation data", () => {
    const audit = decisionAudit({ userMessage: "private", implicit: { kind: "error", reason: "Bearer secret" }, implicitDecision: { intercept: false, source: "fail_safe_release", rationale: "private" } });
    expect(audit.implicit).toEqual({ kind: "error" });
    expect(audit.implicitDecision).toEqual({ intercept: false, source: "fail_safe_release" });
    expect(JSON.stringify(audit)).not.toMatch(/private|secret/);
  });
});
