import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

let paths: { appRoot: string; workdir: string; logsDir: string } | null = null;

const EVAL_CREDENTIALS = [
  ["EVAL_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"],
  ["EVAL_KIMI_API_KEY", "KIMI_API_KEY"],
  ["EVAL_EMBEDDING_API_KEY", "EMBEDDING_API_KEY"],
] as const;

/**
 * Keep batch evaluation from silently spending production credentials loaded from
 * `.env.local`. Dedicated EVAL_* keys are mapped only inside this evaluation process.
 * A production-key override exists for emergency/manual work, but must be explicit.
 */
export function isolateEvalCredentials(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const allowProduction = env.EVAL_ALLOW_PRODUCTION_KEYS === "1";
  const sources: Record<string, string> = {};
  for (const [evalName, runtimeName] of EVAL_CREDENTIALS) {
    const dedicated = env[evalName]?.trim();
    if (dedicated) {
      env[runtimeName] = dedicated;
      sources[runtimeName] = evalName;
    } else if (allowProduction) {
      sources[runtimeName] = env[runtimeName] ? "explicit-production-override" : "missing";
    } else {
      delete env[runtimeName];
      sources[runtimeName] = "disabled-no-dedicated-eval-key";
    }
  }
  return sources;
}

/** 评测入口必须最先调用(且只需一次)。幂等。 */
export function setupEvalEnv(): { appRoot: string; workdir: string; logsDir: string } {
  if (paths) return paths;
  const appRoot = process.cwd();
  if (!existsSync(path.join(appRoot, "src/lib/safety.ts"))) {
    throw new Error("必须从 app 仓库根运行(npm run eval:* / 在仓库根 npx tsx …)");
  }
  // 1) 加载 .env.local(已设置的变量不覆盖)
  const envPath = path.join(appRoot, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } else {
    console.warn("[eval] .env.local 不存在 —— 词表/关键词检索可用,判官与全管线不可用");
  }
  // 生产模块内部仍读取其原变量名；这里只在评测进程中注入专用评测凭据。
  isolateEvalCredentials();
  // 2) 决策日志:确保开启 + 记录原文(评测数据全为合成样例,无真实用户内容)
  delete process.env.QUIET_ROOM_DECISION_LOG_DISABLED;
  process.env.QUIET_ROOM_DECISION_LOG_RAW = "1";
  // 3) 隔离 workdir:决策日志按 process.cwd()/logs 落盘。研究管线(w1:harvest-logs)
  //    读 app/logs —— 评测流量绝不能混进去污染 W1 标注队列。chdir 到 eval/.workdir。
  const workdir = path.join(appRoot, "eval/.workdir");
  mkdirSync(path.join(workdir, "logs"), { recursive: true });
  process.chdir(workdir);
  paths = { appRoot, workdir, logsDir: path.join(workdir, "logs") };
  return paths;
}

export function getEvalPaths() {
  if (!paths) throw new Error("先调用 setupEvalEnv()");
  return paths;
}

export function requireKimi() {
  if (!process.env.KIMI_API_KEY) throw new Error("需要 EVAL_KIMI_API_KEY(判官/全管线评测臂)");
}
export function requireDeepSeek() {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error("需要 EVAL_DEEPSEEK_API_KEY(全管线评测臂)");
}
