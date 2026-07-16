import { Agent, fetch as undiciFetch } from "undici";

/**
 * Transport-layer resilience for the model API calls (DeepSeek / Kimi).
 *
 * Problem it solves: a sudden network drop (Wi-Fi flaps, DNS fails, the TCP/TLS
 * handshake hangs) used to leave the request stuck until the per-call
 * AbortController fired — 12–30s of dead waiting for something that will never
 * connect. The user experiences a frozen "思考中".
 *
 * What "no response" means here — and what it deliberately does NOT:
 *   • We fail fast ONLY on the CONNECTION phase: establishing the socket
 *     (DNS + TCP + TLS). undici's `connect.timeout` caps exactly that window.
 *   • Once the connection is established, the model's normal thinking latency
 *     (deep tier can legitimately take tens of seconds before the first token)
 *     is NOT touched — we do not set headersTimeout / bodyTimeout, so a slow
 *     but live server streams as usual. "断网 = 连不上", not "回得慢".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Latency ledger (why this is strictly cheaper than the old dead-wait):
 *   Dead network, worst case = 4 attempts × 300ms connect timeout
 *                            + 3 × 100ms fixed backoff
 *                            ≈ 1200 + 300 = ~1.5s, then reject with the
 *                              original "fetch failed" error.
 *   Old behaviour: one attempt blocked until the 12s (Kimi judge) / 20–30s
 *                  (DeepSeek reply) AbortController fired.
 *
 * Layering (transport vs application — they don't overlap):
 *   • THIS layer (transport) owns "the network is down": connection-phase
 *     failures, retried up to 3× with a fast connect timeout.
 *   • implicit-risk.ts (application) owns "the API said no": HTTP errors,
 *     rate limits, billing, its own single retry + circuit breaker.
 *   So the dead-net chain is: transport fails fast (~1.5s) → the thrown
 *   "fetch failed" is classified TRANSIENT by classifyKimiJudgeError →
 *   application falls through to the backup judge / fail-safe ladder. Total
 *   time is far under the old ~12s idle wait, and no application-layer
 *   retry/circuit logic changes.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Default connect-phase timeout: no socket in 300ms → treat as "not responding".
 *  Env-tunable (NET_CONNECT_TIMEOUT_MS, clamped 50–5000ms) because the right value is
 *  provider/region-dependent: api.deepseek.com connects in ~50–350ms, but e.g.
 *  api.siliconflow.com measured ~1.4s from a home network (2026-07-16) — a fixed
 *  300ms would strangle such providers with our own retry layer. */
function resolveDefaultConnectTimeout(): number {
  const raw = Number(process.env.NET_CONNECT_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 300;
  return Math.min(5000, Math.max(50, Math.round(raw)));
}
export const DEFAULT_CONNECT_TIMEOUT_MS = resolveDefaultConnectTimeout();
/** At most 3 retries → ≤ 4 total attempts. */
export const DEFAULT_MAX_RETRIES = 3;
/** Fixed backoff between attempts. */
const RETRY_DELAY_MS = 100;

// Module-level singleton undici Agent carrying the 300ms connect timeout. Node's
// global fetch is undici under the hood and honours a non-standard `dispatcher`
// on RequestInit, which is how we inject this connect budget without touching
// per-call timeouts. Agents are cached by timeout so a non-default opt reuses one
// instance instead of leaking a new pool on every call.
const agentByTimeout = new Map<number, Agent>();

function dispatcherFor(connectTimeoutMs: number): Agent {
  let agent = agentByTimeout.get(connectTimeoutMs);
  if (!agent) {
    agent = new Agent({ connect: { timeout: connectTimeoutMs } });
    agentByTimeout.set(connectTimeoutMs, agent);
  }
  return agent;
}
// Eagerly construct the default singleton so the common path never pays for it lazily.
dispatcherFor(DEFAULT_CONNECT_TIMEOUT_MS);

/** Connection-phase error codes worth retrying — no response was ever received. */
const CONNECT_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT", // undici: socket not established within connect.timeout
  "ECONNREFUSED", // nothing listening
  "ENOTFOUND", // DNS: host not found
  "EAI_AGAIN", // DNS: temporary resolution failure
  "ETIMEDOUT", // socket-level timeout
  "ECONNRESET", // connection reset before/while handshaking
  "EPIPE", // broken pipe on a half-open socket
  "UND_ERR_SOCKET" // undici: socket error before headers
]);

/**
 * Pull the OS/undici error code out of a rejected fetch. Node's global fetch
 * wraps the real cause: `TypeError: fetch failed` with `err.cause.code` set to
 * the underlying code, so check `cause.code` first, then a direct `err.code`.
 */
function connectionErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const causeCode = (cause as { code?: unknown }).code;
      if (typeof causeCode === "string") return causeCode;
    }
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function isConnectionPhaseError(err: unknown): boolean {
  const code = connectionErrorCode(err);
  return code !== undefined && CONNECT_ERROR_CODES.has(code);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `dispatcher` is undici's non-standard RequestInit field; typed here so callers pass plain RequestInit. */
type ResilientInit = RequestInit & { dispatcher?: Agent };

export interface ResilientFetchOptions {
  /** Connect-phase timeout in ms (default 300). Selects/creates the matching Agent. */
  connectTimeoutMs?: number;
  /** Max retries on connection-phase failure (default 3 → ≤ 4 attempts). */
  maxRetries?: number;
  /** Injectable fetch (default globalThis.fetch) — for tests. */
  fetchImpl?: typeof fetch;
  /** Injectable backoff (default setTimeout) — for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * fetch with a tight connect timeout and connection-phase-only retries.
 *
 * Retry policy — retry ONLY when no response was ever received AND the failure
 * is a connection-phase error (see CONNECT_ERROR_CODES). Explicitly never retry:
 *   • an already-aborted `init.signal` → throw immediately (respect the caller's
 *     timeout budget; do not spend attempts on a cancelled request);
 *   • any HTTP response, whatever the status — a 4xx/5xx is a semantic error the
 *     application layer owns, not a transport failure;
 *   • non-connection errors (e.g. a body-parsing TypeError with no network code).
 */
export async function resilientFetch(
  url: string | URL,
  init?: ResilientInit,
  opts?: ResilientFetchOptions
): Promise<Response> {
  const connectTimeoutMs = opts?.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const fetchImpl = opts?.fetchImpl ?? (undiciFetch as unknown as typeof globalThis.fetch); // 与 Agent 同一 undici 实例:dispatcher 必配对,且绕开 Next 补丁 fetch(v0.7.5 线上事故根因)
  const sleep = opts?.sleep ?? defaultSleep;
  const signal = init?.signal ?? undefined;

  // Inject the connect-timeout dispatcher, leaving a caller-supplied one intact.
  const requestInit: ResilientInit = { ...init };
  if (requestInit.dispatcher === undefined) {
    requestInit.dispatcher = dispatcherFor(connectTimeoutMs);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    // Honour the caller's abort budget before every attempt — never retry a
    // request the upper layer has already given up on.
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    }

    try {
      // A resolved fetch = a response arrived (any status). Return it as-is; HTTP
      // errors are the application layer's to interpret, never retried here.
      return await fetchImpl(url, requestInit);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isConnectionPhaseError(err) && !signal?.aborted) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      // Out of retries, or not a connection-phase failure → surface the ORIGINAL
      // error unchanged (its message/cause feed the application-layer classifier).
      throw err;
    }
  }

  // Unreachable (the loop always returns or throws) — satisfies the type checker.
  throw lastError;
}
