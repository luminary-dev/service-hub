// Redis-backed email delivery queue (RFC: stateful-notification-service).
// Deliberately infra-free — no BullMQ, no stream consumer groups; the same
// plain ioredis client the gateway/identity already use:
//
//   - enqueue: LPUSH notify:email with one JSON job per recipient
//   - worker:  BRPOPLPUSH notify:email → notify:processing (5s timeout) →
//              render template → sendMail → LREM notify:processing
//   - reclaim: a periodic sweep returns notify:processing entries older than
//              2 min to the queue, so a crash mid-send retries instead of
//              losing the job
//   - retry:   on send failure the entry is moved (attempt+1) into a durable
//              Redis ZSET (notify:retry) scored by its retry-at (now + 30s ×
//              2^attempt) — durably BEFORE it is LREM'd off processing, so a
//              crash between the two leaves it recoverable, never dropped. A
//              worker poll returns due entries to notify:email; after
//              MAX_ATTEMPTS the entry is dropped with a log.error — email stays
//              best-effort/fail-soft, the contract every caller assumes. (#751:
//              the retry state is Redis-backed, not an in-memory unref'd
//              setTimeout that a restart/crash silently drops.)
//   - degraded: Redis unavailable → fall back to the in-memory one-attempt
//              background fan-out (mirrors the gateway's Redis-down rate-limit
//              fallback). In-app rows are unaffected either way — they are
//              written inline before the ingestion ack.
import { Redis } from "ioredis";
import { Gauge } from "prom-client";
import { sendMail, type Locale } from "./email";
import { renderEventEmail } from "./event-email";
import type { NotificationType } from "./events";
import { log } from "./log";

export const QUEUE_KEY = "notify:email";
export const PROCESSING_KEY = "notify:processing";
// Redis-backed delayed-retry set (#751): member = the JSON job, score = the
// absolute retry-at (ms). Polled by the worker; survives restarts/crashes.
export const RETRY_KEY = "notify:retry";

export const MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 30_000; // 30s × 2^attempt
export const RECLAIM_AFTER_MS = 2 * 60_000; // processing entries older than 2 min
export const RECLAIM_INTERVAL_MS = 60_000;
// How often the worker sweeps notify:retry for entries whose retry-at has
// passed and returns them to notify:email. Well under RETRY_BASE_MS so the
// effective delay stays close to the intended backoff.
export const RETRY_POLL_INTERVAL_MS = 5_000;
const WORKER_BLOCK_SECONDS = 5;
// Redis-down pause between worker iterations, so a dead backend doesn't spin.
const WORKER_ERROR_PAUSE_MS = 5_000;

export type EmailJob = {
  type: NotificationType;
  to: string;
  locale: Locale;
  payload: Record<string, unknown>;
  // Absolute URL, built from the gateway's x-origin at ingestion time (in-app
  // rows keep the relative link; emails need a clickable absolute one).
  link: string;
  attempt: number;
};

// Minimal command surface so tests can inject a fake without a live
// connection (same pattern as the gateway's RedisCommands).
export type QueueRedis = {
  lpush(key: string, value: string): Promise<unknown>;
  brpoplpush(source: string, destination: string, timeoutSec: number): Promise<string | null>;
  lrem(key: string, count: number, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  llen(key: string): Promise<number>;
  zadd(key: string, score: number | string, member: string): Promise<unknown>;
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
  zrem(key: string, member: string): Promise<number>;
  zcard(key: string): Promise<number>;
};

// ---------------------------------------------------------------------------
// Connections. Two clients: blocking BRPOPLPUSH monopolizes its connection, so
// the worker gets a dedicated one; enqueue + the reclaim sweep share another.
// undefined = not initialized yet; null = no REDIS_URL configured.
// ---------------------------------------------------------------------------

type Closeable = { quit(): Promise<unknown>; disconnect(): void };

let sharedClient: (QueueRedis & Closeable) | null | undefined;
let workerClient: (QueueRedis & Closeable) | null | undefined;

function createClient(blocking: boolean): (QueueRedis & Closeable) | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new Redis(url, {
    // Enqueue must fail fast into the degraded fallback instead of stalling
    // the ingestion request. The worker's blocking reads need retries left on
    // (a rejected BRPOPLPUSH is just caught and re-issued after a pause).
    maxRetriesPerRequest: blocking ? null : 1,
    enableOfflineQueue: false,
  });
  // Without an 'error' listener ioredis surfaces connection errors as
  // unhandled exceptions. Edge-triggered log, mirroring identity's revocation
  // client.
  client.on("error", (err) => {
    if (redisErrorLogged) return;
    redisErrorLogged = true;
    log.warn("email-queue Redis connection error; email delivery degraded to direct sends", { err });
  });
  return client;
}

let redisErrorLogged = false;

export function getQueueRedis(): QueueRedis | null {
  if (sharedClient !== undefined) return sharedClient;
  sharedClient = createClient(false);
  return sharedClient;
}

function getWorkerRedis(): QueueRedis | null {
  if (workerClient !== undefined) return workerClient;
  workerClient = createClient(true);
  return workerClient;
}

// Close both connections during graceful shutdown (no-op when never opened).
export async function closeQueueRedis(): Promise<void> {
  for (const client of [sharedClient, workerClient]) {
    if (!client) continue;
    try {
      await client.quit();
    } catch {
      client.disconnect(); // best-effort — force-disconnect if quit fails
    }
  }
  sharedClient = undefined;
  workerClient = undefined;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

// Render + send one job. Returns true on success (including the dev console
// fallback, which "succeeds" without delivering) and false on a send failure
// the caller should retry. A job whose type has no email template resolves
// true (nothing to send — ingestion normally never enqueues these).
async function sendJob(job: EmailJob): Promise<boolean> {
  let rendered: { subject: string; html: string } | null;
  try {
    rendered = renderEventEmail(job.type, job.payload, job.link, job.locale);
  } catch (err) {
    // Malformed legacy/hand-crafted job — dropping beats crash-looping on it.
    log.error("email job failed to render — dropping", { type: job.type, err });
    return true;
  }
  if (!rendered) return true;
  try {
    await sendMail({ to: job.to, subject: rendered.subject, html: rendered.html });
    return true;
  } catch {
    return false;
  }
}

// Degraded mode: one best-effort attempt, in the background, mirroring the
// pre-queue `void (async () => …)` fan-out in routes/email.ts.
function sendDirect(jobs: EmailJob[]): void {
  void (async () => {
    let delivered = 0;
    for (const job of jobs) {
      if (await sendJob(job)) delivered++;
    }
    log.info("direct email fan-out complete (queue unavailable)", {
      context: "notifications",
      accepted: jobs.length,
      delivered,
    });
  })();
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

// Queue one job per recipient; falls back to the direct one-attempt fan-out
// when Redis is unconfigured or down. Never throws — email is best-effort.
export async function enqueueEmailJobs(
  jobs: EmailJob[],
  redis: QueueRedis | null = getQueueRedis()
): Promise<void> {
  if (jobs.length === 0) return;
  if (!redis) {
    sendDirect(jobs);
    return;
  }
  const failed: EmailJob[] = [];
  for (const job of jobs) {
    try {
      await redis.lpush(QUEUE_KEY, JSON.stringify(job));
      redisErrorLogged = false; // recovered — allow the next error to log
    } catch {
      failed.push(job);
    }
  }
  if (failed.length > 0) sendDirect(failed);
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function retryDelayMs(attempt: number): number {
  return RETRY_BASE_MS * 2 ** attempt;
}

// Process one raw queue entry (already moved onto the processing list):
// send, then LREM on success; on failure move a backed-off copy into the
// durable retry ZSET or drop after MAX_ATTEMPTS. Exported for unit tests.
export async function processEntry(
  redis: QueueRedis,
  entry: string,
  now: number = Date.now()
): Promise<void> {
  let job: EmailJob;
  try {
    job = JSON.parse(entry) as EmailJob;
  } catch {
    log.error("email queue entry is not valid JSON — dropping", { entry: entry.slice(0, 200) });
    await redis.lrem(PROCESSING_KEY, 1, entry);
    return;
  }

  const ok = await sendJob(job);
  if (ok) {
    await redis.lrem(PROCESSING_KEY, 1, entry);
    return;
  }

  const attempt = Number.isInteger(job.attempt) ? job.attempt : 0;
  if (attempt + 1 >= MAX_ATTEMPTS) {
    log.error("email delivery failed after max attempts — dropping", {
      type: job.type,
      attempts: attempt + 1,
    });
    await redis.lrem(PROCESSING_KEY, 1, entry);
    return;
  }

  // #751 crash-safety: durably persist the retry BEFORE removing the entry
  // from the processing list. If we crash between the ZADD and the LREM, the
  // original is still on notify:processing for reclaimStale to recover — the
  // worst case is one duplicate send, never a dropped email. (The old code
  // LREM'd first and held the retry only in an in-memory unref'd setTimeout,
  // so a restart in the backoff window lost it outright.)
  const next = JSON.stringify({ ...job, attempt: attempt + 1 });
  await redis.zadd(RETRY_KEY, now + retryDelayMs(attempt), next);
  await redis.lrem(PROCESSING_KEY, 1, entry);
}

// Return retry-ZSET entries whose retry-at has passed to notify:email. ZREM
// before LPUSH so a second poller (or a shutdown flush) can't move the same
// entry twice. Exported for unit tests.
export async function pollRetries(redis: QueueRedis, now: number = Date.now()): Promise<number> {
  const due = await redis.zrangebyscore(RETRY_KEY, "-inf", now);
  let moved = 0;
  for (const member of due) {
    if ((await redis.zrem(RETRY_KEY, member)) > 0) {
      await redis.lpush(QUEUE_KEY, member);
      moved++;
    }
  }
  return moved;
}

// Move every pending retry (due or not) back onto notify:email. Called on
// graceful shutdown (#751) so pending retries are flushed to the durable queue
// instead of being cleared/abandoned; they persist in the ZSET across a crash
// regardless, but flushing lets a restarting instance pick them straight up.
export async function flushRetries(redis: QueueRedis): Promise<number> {
  const pending = await redis.zrangebyscore(RETRY_KEY, "-inf", "+inf");
  let flushed = 0;
  for (const member of pending) {
    if ((await redis.zrem(RETRY_KEY, member)) > 0) {
      await redis.lpush(QUEUE_KEY, member);
      flushed++;
    }
  }
  if (flushed > 0) {
    log.info("flushed pending email retries back to the queue on shutdown", { flushed });
  }
  return flushed;
}

// Flush pending retries on shutdown using the shared client (no-op when Redis
// is unconfigured/down). Awaited from index.ts before the connections close.
export async function flushPendingRetries(): Promise<void> {
  const redis = getQueueRedis();
  if (!redis) return;
  try {
    await flushRetries(redis);
  } catch (err) {
    log.warn("failed to flush pending email retries on shutdown", { err });
  }
}

// Current email-queue depth by state, for the Prometheus gauge (#746) and
// tests. Exported so the gauge's scrape-time collect stays a thin wrapper.
export async function queueDepth(
  redis: QueueRedis
): Promise<{ pending: number; processing: number; retry: number }> {
  const [pending, processing, retry] = await Promise.all([
    redis.llen(QUEUE_KEY),
    redis.llen(PROCESSING_KEY),
    redis.zcard(RETRY_KEY),
  ]);
  return { pending, processing, retry };
}

// #746: email-queue depth gauge, sampled at scrape time. Registered on
// prom-client's default registry (the one metricsHandler serializes), so it
// rides the existing /metrics endpoint without touching the canonical
// metrics.ts. No-op labels when Redis is unconfigured/down — last values hold.
new Gauge({
  name: "notification_email_queue_depth",
  help: "Email delivery queue depth by state: pending (notify:email), processing (notify:processing), retry (notify:retry ZSET).",
  labelNames: ["state"],
  async collect() {
    const redis = getQueueRedis();
    if (!redis) return;
    try {
      const depth = await queueDepth(redis);
      this.set({ state: "pending" }, depth.pending);
      this.set({ state: "processing" }, depth.processing);
      this.set({ state: "retry" }, depth.retry);
    } catch {
      // Redis down — leave the last sampled values in place.
    }
  },
});

// Reclaim processing-list entries that have sat there past RECLAIM_AFTER_MS —
// a worker crashed mid-send and never LREM'd them. BRPOPLPUSH copies the entry
// verbatim, so there is no per-entry pickup timestamp; instead the sweep
// remembers when it FIRST saw each entry and reclaims the ones still present
// two sweeps later. Exported for unit tests.
const firstSeen = new Map<string, number>();

export async function reclaimStale(
  redis: QueueRedis,
  now: number = Date.now()
): Promise<number> {
  const entries = await redis.lrange(PROCESSING_KEY, 0, -1);
  const current = new Set(entries);
  for (const key of firstSeen.keys()) {
    if (!current.has(key)) firstSeen.delete(key); // finished normally
  }
  let reclaimed = 0;
  for (const entry of entries) {
    const seen = firstSeen.get(entry);
    if (seen === undefined) {
      firstSeen.set(entry, now);
      continue;
    }
    if (now - seen < RECLAIM_AFTER_MS) continue;
    // LREM before LPUSH so a concurrent finisher can't double-deliver.
    const removed = await redis.lrem(PROCESSING_KEY, 1, entry);
    if (removed > 0) {
      await redis.lpush(QUEUE_KEY, entry);
      reclaimed++;
    }
    firstSeen.delete(entry);
  }
  if (reclaimed > 0) {
    log.warn("reclaimed stale email jobs from the processing list", { reclaimed });
  }
  return reclaimed;
}

// Test-only: reset the sweep's memory between cases.
export function resetReclaimState(): void {
  firstSeen.clear();
}

let running = false;
let reclaimInterval: ReturnType<typeof setInterval> | undefined;
let retryPollInterval: ReturnType<typeof setInterval> | undefined;

// One in-process worker loop per instance + the periodic reclaim sweep.
// No-op (with a log line) when REDIS_URL is unset — enqueue then always takes
// the direct-send fallback, so nothing ever waits in a queue.
export function startEmailWorker(): void {
  const worker = getWorkerRedis();
  const shared = getQueueRedis();
  if (!worker || !shared) {
    log.info("REDIS_URL not set — email queue disabled, sends are direct one-attempt");
    return;
  }
  running = true;

  void (async () => {
    while (running) {
      try {
        const entry = await worker.brpoplpush(QUEUE_KEY, PROCESSING_KEY, WORKER_BLOCK_SECONDS);
        if (entry !== null) await processEntry(shared, entry);
      } catch {
        // Redis down — the enqueue path is already falling back to direct
        // sends (and logging, edge-triggered); just pause and retry.
        await new Promise((r) => setTimeout(r, WORKER_ERROR_PAUSE_MS));
      }
    }
  })();

  reclaimInterval = setInterval(() => {
    reclaimStale(shared).catch(() => {
      // Redis down — the next sweep retries; the connection error already
      // logged edge-triggered.
    });
  }, RECLAIM_INTERVAL_MS);
  reclaimInterval.unref();

  // Return due retries from notify:retry to notify:email (#751). Errors are
  // swallowed like the reclaim sweep — the next poll retries.
  retryPollInterval = setInterval(() => {
    pollRetries(shared).catch(() => {});
  }, RETRY_POLL_INTERVAL_MS);
  retryPollInterval.unref();
}

// Stop the loop + sweeps (graceful shutdown; connections closed separately by
// closeQueueRedis so an in-flight iteration can still LREM, and pending retries
// are flushed by flushPendingRetries before the connections close). Pending
// retries live in the durable notify:retry ZSET, so there are no in-memory
// timers to clear — a restart/crash no longer drops them.
export function stopEmailWorker(): void {
  running = false;
  if (reclaimInterval) clearInterval(reclaimInterval);
  reclaimInterval = undefined;
  if (retryPollInterval) clearInterval(retryPollInterval);
  retryPollInterval = undefined;
}
