import crypto from "node:crypto";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  keyHash: string;
};

type RateLimitOptions = {
  keyPrefix: string;
  max: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let cleanupCounter = 0;

function nowMs() {
  return Date.now();
}

function readHeaderIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwarded ||
    "unknown-client"
  ).slice(0, 128);
}

function clientFingerprint(request: Request) {
  const ip = readHeaderIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) ?? "";
  return `${ip}|${userAgent}`;
}

function hashRateLimitKey(value: string) {
  const h = crypto.createHash("sha256");
  h.update(process.env.QUIET_ROOM_RATE_LIMIT_SALT ?? "quiet-room-rate-limit-static-salt");
  h.update("|");
  h.update(value);
  return `rl_${h.digest("hex").slice(0, 24)}`;
}

function shouldBypassRateLimit() {
  return process.env.QUIET_ROOM_RATE_LIMIT_DISABLED === "1" || Boolean(process.env.SAFETY_EVAL_MODE);
}

function cleanupExpired(now: number) {
  cleanupCounter += 1;
  if (cleanupCounter % 200 !== 0) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function readRateLimitEnv(maxEnv: string, windowEnv: string, fallbackMax: number, fallbackWindowMs: number) {
  const max = Number.parseInt(process.env[maxEnv] ?? "", 10);
  const windowMs = Number.parseInt(process.env[windowEnv] ?? "", 10);

  return {
    max: Number.isFinite(max) ? Math.min(Math.max(max, 1), 10_000) : fallbackMax,
    windowMs: Number.isFinite(windowMs) ? Math.min(Math.max(windowMs, 1000), 86_400_000) : fallbackWindowMs
  };
}

export function checkRateLimit(request: Request, options: RateLimitOptions): RateLimitResult {
  const current = nowMs();
  const keyHash = hashRateLimitKey(`${options.keyPrefix}|${clientFingerprint(request)}`);

  if (shouldBypassRateLimit()) {
    return {
      allowed: true,
      limit: options.max,
      remaining: options.max,
      resetAt: current + options.windowMs,
      retryAfterSeconds: 0,
      keyHash
    };
  }

  cleanupExpired(current);

  const existing = buckets.get(keyHash);
  const bucket =
    existing && existing.resetAt > current
      ? existing
      : {
          count: 0,
          resetAt: current + options.windowMs
        };

  bucket.count += 1;
  buckets.set(keyHash, bucket);

  const remaining = Math.max(0, options.max - bucket.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));

  return {
    allowed: bucket.count <= options.max,
    limit: options.max,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds,
    keyHash
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSeconds) })
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json(
    {
      error: "Rate limit exceeded",
      retryAfterSeconds: result.retryAfterSeconds
    },
    {
      status: 429,
      headers: rateLimitHeaders(result)
    }
  );
}

export function resetRateLimitForTests() {
  buckets.clear();
  cleanupCounter = 0;
}
