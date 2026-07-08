import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export type LogCursor = { file: string | null; offset: number };

const LOG_FILE_RE = /^decisions-\d{4}-\d{2}-\d{2}\.jsonl$/;

function listLogFiles(logsDir: string): string[] {
  if (!existsSync(logsDir)) return [];
  return readdirSync(logsDir)
    .filter((f) => LOG_FILE_RE.test(f))
    .sort(); // 文件名含日期,字典序 = 时间序
}

/** 记下当前最新日志文件与字节偏移(调用 POST 之前拍快照) */
export function snapshotCursor(logsDir: string): LogCursor {
  const files = listLogFiles(logsDir);
  if (files.length === 0) return { file: null, offset: 0 };
  const latest = files[files.length - 1];
  const filePath = path.join(logsDir, latest);
  return { file: filePath, offset: statSync(filePath).size };
}

function parseLines(content: string): Array<{ route: string; [k: string]: unknown }> {
  const out: Array<{ route: string; [k: string]: unknown }> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // 跳过坏行
    }
  }
  return out;
}

function collectNewEntries(logsDir: string, cursor: LogCursor): Array<{ route: string; [k: string]: unknown }> {
  const files = listLogFiles(logsDir);
  const cursorName = cursor.file ? path.basename(cursor.file) : null;
  const entries: Array<{ route: string; [k: string]: unknown }> = [];

  for (const name of files) {
    const filePath = path.join(logsDir, name);
    if (cursorName && name === cursorName) {
      // 同一文件:只读增量字节
      const size = statSync(filePath).size;
      if (size <= cursor.offset) continue;
      const length = size - cursor.offset;
      const buffer = Buffer.alloc(length);
      const fd = openSync(filePath, "r");
      try {
        readSync(fd, buffer, 0, length, cursor.offset);
      } finally {
        closeSync(fd);
      }
      entries.push(...parseLines(buffer.toString("utf8")));
    } else if (!cursorName || name > cursorName) {
      // 跨午夜产生的新文件:全文读取
      entries.push(...parseLines(readFileSync(filePath, "utf8")));
    }
    // 否则(比 cursor 更旧的文件)忽略
  }
  return entries;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** 响应消费完后轮询新增日志行(appendDecisionLog 是 fire-and-forget,有毫秒级延迟) */
export async function readNewEntries(
  logsDir: string,
  cursor: LogCursor,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<Array<{ route: string; [k: string]: unknown }>> {
  const timeoutMs = opts.timeoutMs ?? 1500;
  const intervalMs = opts.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const entries = collectNewEntries(logsDir, cursor);
    if (entries.length > 0) return entries;
    if (Date.now() >= deadline) return [];
    await sleep(intervalMs);
  }
}
