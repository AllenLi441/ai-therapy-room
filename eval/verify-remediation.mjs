#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(APP, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const checks = [];

function check(name, condition, detail = "") {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
}

const referee = json("eval/reports/referee_gold_v1.audit.json");
check("1 referee agreement invariant", referee.invariant === "referee_gold equals the C/D agreement set");
check("1 referee common cohort", referee.coverage.common === 276 && referee.coverage.agreed === 228);
check("1 referee kappa", Math.abs(referee.interReferee.kappa - 0.706591070163005) < 1e-12);
check("1 no invalid 3pp subtraction", read("eval/reports/referee_gold_v1.md").includes("同队列变化为 -1.1pp"));

const v4 = read("eval/reports/benchmark_results_v4_reasoner.md");
check("2 v4-pro canonical CPsyExam", v4.includes("| CPsyExam 抽样 | 599 | 518 | 86.48%"));
check("2 v4-pro EA/EU complete", v4.includes("| EmoBench-EA 官方 prompt/scoring proxy | 400 | 297 | 74.25%") && v4.includes("| EmoBench-EU 官方 prompt/scoring proxy | 400 | 286 | 71.50%"));
check("2 sample scope disclosed", v4.includes("不是 3,902 条全量"));
check("2 EmoBench protocol gap disclosed", v4.includes("5 次采样多数票 × 4 个选项排列"));

const card = read("eval/DATASET_CARD.md");
check("3 dataset status honest", card.includes("human_review` 仍为 `pending") && card.includes("均不支持“比 PsyGUARD 更好”的结论"));
check("3 provenance gap audited", existsSync(join(APP, "eval/provenance-audit.mjs")) && card.includes("不能据此推断生成主体"));

const manifest = json("eval/human-study/sheets/MANIFEST.json");
check("4/6 balanced calibration", manifest.calibration.n === 12 && Object.values(manifest.calibration.distribution).every((n) => n === 3));
check("4/6 focal cohort", manifest.main.focal === 100 && manifest.main.context === 42 && manifest.totalRows === 154);
check("4/6 no calibration leakage", manifest.noConversationOverlapBetweenCalibrationAndMain === true);
check("4/6 scoring key kept private", read(".gitignore").includes("eval/human-study/sheets/KEY_mapping_*.jsonl"));
const humanGold = join(APP, "eval/human-study/human_gold.jsonl");
if (existsSync(humanGold)) {
  check("4/6 completed human gold has audit", existsSync(join(APP, "eval/human-study/human_gold.audit.json")));
  check("4/6 completed human gold has report", existsSync(join(APP, "eval/human-study/HUMAN_GOLD_REPORT.md")));
} else {
  check("4/6 pending human state disclosed", read("eval/PUBLICATION_READINESS.md").includes("NOT READY"));
}

check("5 one-paper decision remains conditional", read("eval/PUBLICATION_READINESS.md").includes("优先准备一篇") && read("eval/PUBLICATION_READINESS.md").includes("不是既定结论"));

const net = read("src/lib/net.ts");
check("7 three total transport attempts", net.includes("DEFAULT_MAX_RETRIES = 2"));
check("7 realistic default connect timeout", net.includes("return 1500"));
check("7 release candidate version", read("src/lib/version.ts").includes('APP_VERSION = "0.7.8"'));
check("7 deploy evidence endpoint", read("src/app/api/health/route.ts").includes("maxAttempts: DEFAULT_MAX_RETRIES + 1"));
const evalEnv = read("eval/adapters/env.ts");
check("7 batch credentials isolated", evalEnv.includes("isolateEvalCredentials") && evalEnv.includes("EVAL_ALLOW_PRODUCTION_KEYS"));

const detection = read("eval/reports/detection_arms.md");
check("8 passive actual routing", detection.includes("18/60(30.0%)") && detection.includes("15/60(25.0%)"));
check("8 unsupported half-half removed", !detection.includes("结构假象半") && !detection.includes("真实漏检半"));

check("9 old IMHI report superseded", read("eval/reports/imhi_zero_shot_v3.md").includes("SUPERSEDED"));
check("9 significance scope disclosed", read("eval/reports/imhi_uniform_v3u.md").includes("不能作为两模型差值的显著性检验"));
check("9 unsupported tie/robust-win removed", !read("eval/reports/imhi_uniform_v3u.md").includes("(平手") && !read("eval/reports/imhi_uniform_v3u.md").includes("稳健超 GPT-4"));

console.log(`nine-point remediation check PASS: ${checks.length} deterministic assertions`);
