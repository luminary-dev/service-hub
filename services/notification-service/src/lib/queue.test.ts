// Unit tests for the Redis email queue (RFC: stateful-notification-service):
// enqueue + degraded direct-send fallback, the worker's process/ack/retry
// cycle with exponential backoff and the max-attempt drop, and the
// processing-list reclaim sweep. Redis is a hand-rolled in-memory fake and
// sendMail is mocked — no live Redis or Resend.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./email", async (importActual) => {
  const actual = await importActual<typeof import("./email")>();
  return { ...actual, sendMail: vi.fn().mockResolvedValue({ delivered: true }) };
});

import { sendMail } from "./email";
import {
  enqueueEmailJobs,
  flushRetries,
  MAX_ATTEMPTS,
  pollRetries,
  processEntry,
  PROCESSING_KEY,
  queueDepth,
  QUEUE_KEY,
  reclaimStale,
  RECLAIM_AFTER_MS,
  resetReclaimState,
  retryDelayMs,
  RETRY_BASE_MS,
  RETRY_KEY,
  type EmailJob,
  type QueueRedis,
} from "./queue";

const sendMailMock = vi.mocked(sendMail);

// In-memory list + sorted-set store implementing the QueueRedis surface.
function fakeRedis(): QueueRedis & {
  lists: Map<string, string[]>;
  zsets: Map<string, Map<string, number>>;
} {
  const lists = new Map<string, string[]>();
  const zsets = new Map<string, Map<string, number>>();
  const list = (key: string) => {
    if (!lists.has(key)) lists.set(key, []);
    return lists.get(key)!;
  };
  const zset = (key: string) => {
    if (!zsets.has(key)) zsets.set(key, new Map());
    return zsets.get(key)!;
  };
  const bound = (v: number | string, dir: 1 | -1) =>
    v === "-inf" || v === "+inf" ? dir * Infinity : Number(v);
  return {
    lists,
    zsets,
    async lpush(key, value) {
      list(key).unshift(value);
      return list(key).length;
    },
    async brpoplpush(source, dest) {
      const entry = list(source).pop();
      if (entry === undefined) return null;
      list(dest).unshift(entry);
      return entry;
    },
    async lrem(key, _count, value) {
      const l = list(key);
      const idx = l.indexOf(value);
      if (idx === -1) return 0;
      l.splice(idx, 1);
      return 1;
    },
    async lrange(key) {
      return [...list(key)];
    },
    async llen(key) {
      return list(key).length;
    },
    async zadd(key, score, member) {
      zset(key).set(member, Number(score));
      return 1;
    },
    async zrangebyscore(key, min, max) {
      const lo = bound(min, -1);
      const hi = bound(max, 1);
      return [...zset(key).entries()]
        .filter(([, s]) => s >= lo && s <= hi)
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
    },
    async zrem(key, member) {
      return zset(key).delete(member) ? 1 : 0;
    },
    async zcard(key) {
      return zset(key).size;
    },
  };
}

function job(overrides: Partial<EmailJob> = {}): EmailJob {
  return {
    type: "NEW_JOB_MATCH",
    to: "provider@example.com",
    locale: "en",
    payload: { jobTitle: "Fix a leaking tap", district: "Colombo" },
    link: "https://baas.lk/jobs/job_1",
    attempt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMailMock.mockResolvedValue({ delivered: true } as never);
  resetReclaimState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("enqueueEmailJobs", () => {
  it("LPUSHes one JSON job per recipient onto notify:email", async () => {
    const redis = fakeRedis();
    await enqueueEmailJobs([job(), job({ to: "b@example.com" })], redis);
    const entries = redis.lists.get(QUEUE_KEY)!;
    expect(entries).toHaveLength(2);
    expect(JSON.parse(entries[1])).toMatchObject({ to: "provider@example.com", attempt: 0 });
    expect(sendMailMock).not.toHaveBeenCalled(); // queued, not sent inline
  });

  it("falls back to a direct one-attempt send when Redis is not configured", async () => {
    await enqueueEmailJobs([job()], null);
    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));
    expect(sendMailMock.mock.calls[0][0].to).toBe("provider@example.com");
  });

  it("falls back to a direct send when LPUSH throws (Redis down)", async () => {
    const redis = fakeRedis();
    redis.lpush = vi.fn().mockRejectedValue(new Error("connection refused"));
    await enqueueEmailJobs([job()], redis);
    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));
  });

  it("a failed direct send stays best-effort (one attempt, no retry, no throw)", async () => {
    sendMailMock.mockRejectedValue(new Error("resend down"));
    await enqueueEmailJobs([job(), job({ to: "b@example.com" })], null);
    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(2));
  });
});

describe("processEntry", () => {
  it("renders, sends and LREMs the entry on success", async () => {
    const redis = fakeRedis();
    const entry = JSON.stringify(job());
    await redis.lpush(PROCESSING_KEY, entry);

    await processEntry(redis, entry);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ to: "provider@example.com" });
    expect(redis.lists.get(PROCESSING_KEY)).toEqual([]);
    expect(redis.lists.get(QUEUE_KEY) ?? []).toEqual([]);
  });

  it("moves a failed entry to the durable retry ZSET scored by its retry-at", async () => {
    sendMailMock.mockRejectedValue(new Error("resend down"));
    const redis = fakeRedis();
    const entry = JSON.stringify(job({ attempt: 0 }));
    await redis.lpush(PROCESSING_KEY, entry);

    const t0 = 1_000_000;
    await processEntry(redis, entry, t0);
    expect(redis.lists.get(PROCESSING_KEY)).toEqual([]); // acked off processing
    expect(redis.lists.get(QUEUE_KEY) ?? []).toEqual([]); // not on the main queue — delayed
    // Durably parked in notify:retry (attempt: 1) at now + 30s × 2^0.
    const retry = redis.zsets.get(RETRY_KEY)!;
    expect(retry.size).toBe(1);
    const [[member, score]] = [...retry.entries()];
    expect(JSON.parse(member)).toMatchObject({ attempt: 1 });
    expect(score).toBe(t0 + RETRY_BASE_MS);
  });

  it("persists the retry BEFORE removing the entry from processing (#751 crash-safety)", async () => {
    sendMailMock.mockRejectedValue(new Error("resend down"));
    const redis = fakeRedis();
    const entry = JSON.stringify(job({ attempt: 0 }));
    await redis.lpush(PROCESSING_KEY, entry);

    const order: string[] = [];
    const realZadd = redis.zadd.bind(redis);
    const realLrem = redis.lrem.bind(redis);
    redis.zadd = async (k, s, m) => {
      order.push("zadd");
      return realZadd(k, s, m);
    };
    redis.lrem = async (k, c, v) => {
      if (k === PROCESSING_KEY) order.push("lrem");
      return realLrem(k, c, v);
    };

    await processEntry(redis, entry);
    expect(order).toEqual(["zadd", "lrem"]);
  });

  it("polls due retries from the ZSET back onto notify:email", async () => {
    const redis = fakeRedis();
    const entry = JSON.stringify(job({ attempt: 1 }));
    const t0 = 1_000_000;
    await redis.zadd(RETRY_KEY, t0 + RETRY_BASE_MS, entry);

    // Not due yet → left in place.
    expect(await pollRetries(redis, t0)).toBe(0);
    expect(redis.zsets.get(RETRY_KEY)!.size).toBe(1);
    expect(redis.lists.get(QUEUE_KEY) ?? []).toEqual([]);

    // Due → removed from the ZSET and pushed to the queue exactly once.
    expect(await pollRetries(redis, t0 + RETRY_BASE_MS)).toBe(1);
    expect(redis.zsets.get(RETRY_KEY)!.size).toBe(0);
    expect(redis.lists.get(QUEUE_KEY)).toEqual([entry]);
  });

  it("doubles the delay per attempt (30s × 2^n)", () => {
    expect(retryDelayMs(0)).toBe(30_000);
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
  });

  it(`drops the job after ${MAX_ATTEMPTS} attempts`, async () => {
    sendMailMock.mockRejectedValue(new Error("resend down"));
    const redis = fakeRedis();
    // attempt index MAX_ATTEMPTS-1 = the final try.
    const entry = JSON.stringify(job({ attempt: MAX_ATTEMPTS - 1 }));
    await redis.lpush(PROCESSING_KEY, entry);

    await processEntry(redis, entry);
    expect(redis.lists.get(QUEUE_KEY) ?? []).toEqual([]); // dropped, not re-enqueued
    expect(redis.zsets.get(RETRY_KEY) ?? new Map()).toEqual(new Map()); // not parked for retry
    expect(redis.lists.get(PROCESSING_KEY)).toEqual([]); // still acked off processing
  });

  it("drops a non-JSON entry instead of crash-looping on it", async () => {
    const redis = fakeRedis();
    await redis.lpush(PROCESSING_KEY, "not json");
    await processEntry(redis, "not json");
    expect(redis.lists.get(PROCESSING_KEY)).toEqual([]);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("treats a type with no email template as done (no send, no retry)", async () => {
    const redis = fakeRedis();
    const entry = JSON.stringify(
      job({ type: "REPORT_RESOLVED", payload: { targetType: "REVIEW", status: "RESOLVED" } })
    );
    await redis.lpush(PROCESSING_KEY, entry);
    await processEntry(redis, entry);
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(redis.lists.get(PROCESSING_KEY)).toEqual([]);
    expect(redis.lists.get(QUEUE_KEY) ?? []).toEqual([]);
  });
});

describe("reclaimStale", () => {
  it("returns entries stuck on the processing list past the threshold to the queue", async () => {
    const redis = fakeRedis();
    const entry = JSON.stringify(job());
    await redis.lpush(PROCESSING_KEY, entry);

    const t0 = 1_000_000;
    // First sweep only records first-seen; the entry stays in processing.
    expect(await reclaimStale(redis, t0)).toBe(0);
    expect(redis.lists.get(PROCESSING_KEY)).toEqual([entry]);

    // Still young at t0 + threshold - 1.
    expect(await reclaimStale(redis, t0 + RECLAIM_AFTER_MS - 1)).toBe(0);

    // Past the threshold → moved back onto the queue.
    expect(await reclaimStale(redis, t0 + RECLAIM_AFTER_MS)).toBe(1);
    expect(redis.lists.get(PROCESSING_KEY)).toEqual([]);
    expect(redis.lists.get(QUEUE_KEY)).toEqual([entry]);
  });

  it("forgets entries that finished normally between sweeps", async () => {
    const redis = fakeRedis();
    const entry = JSON.stringify(job());
    await redis.lpush(PROCESSING_KEY, entry);

    const t0 = 1_000_000;
    await reclaimStale(redis, t0);
    // The worker finishes and LREMs it…
    await redis.lrem(PROCESSING_KEY, 1, entry);
    await reclaimStale(redis, t0 + RECLAIM_AFTER_MS);
    // …and the same payload landing again later starts a fresh clock.
    await redis.lpush(PROCESSING_KEY, entry);
    expect(await reclaimStale(redis, t0 + RECLAIM_AFTER_MS + 1)).toBe(0);
    expect(redis.lists.get(PROCESSING_KEY)).toEqual([entry]);
  });

  it("never reclaims an entry a concurrent worker already removed", async () => {
    const redis = fakeRedis();
    const entry = JSON.stringify(job());
    await redis.lpush(PROCESSING_KEY, entry);
    const t0 = 1_000_000;
    await reclaimStale(redis, t0);
    // Simulate the LREM racing ahead of the sweep's lrange snapshot.
    const realLrange = redis.lrange.bind(redis);
    redis.lrange = async (key) => {
      const snapshot = await realLrange(key, 0, -1);
      await redis.lrem(PROCESSING_KEY, 1, entry); // finisher wins the race
      return snapshot;
    };
    expect(await reclaimStale(redis, t0 + RECLAIM_AFTER_MS)).toBe(0);
    expect(redis.lists.get(QUEUE_KEY) ?? []).toEqual([]);
  });
});

describe("flushRetries", () => {
  it("moves every pending retry (due or not) back onto notify:email", async () => {
    const redis = fakeRedis();
    const soon = JSON.stringify(job({ to: "a@example.com", attempt: 1 }));
    const later = JSON.stringify(job({ to: "b@example.com", attempt: 2 }));
    const t0 = 1_000_000;
    await redis.zadd(RETRY_KEY, t0 + RETRY_BASE_MS, soon);
    await redis.zadd(RETRY_KEY, t0 + RETRY_BASE_MS * 100, later);

    expect(await flushRetries(redis)).toBe(2);
    expect(redis.zsets.get(RETRY_KEY)!.size).toBe(0);
    // Both are back on the durable queue for a restarting instance to pick up.
    expect(redis.lists.get(QUEUE_KEY)).toHaveLength(2);
    expect(redis.lists.get(QUEUE_KEY)).toEqual(expect.arrayContaining([soon, later]));
  });

  it("is a no-op when there are no pending retries", async () => {
    const redis = fakeRedis();
    expect(await flushRetries(redis)).toBe(0);
    expect(redis.lists.get(QUEUE_KEY) ?? []).toEqual([]);
  });
});

describe("queueDepth", () => {
  it("reports pending (queue), processing, and retry (ZSET) depths", async () => {
    const redis = fakeRedis();
    await redis.lpush(QUEUE_KEY, JSON.stringify(job()));
    await redis.lpush(QUEUE_KEY, JSON.stringify(job({ to: "b@example.com" })));
    await redis.lpush(PROCESSING_KEY, JSON.stringify(job({ to: "c@example.com" })));
    await redis.zadd(RETRY_KEY, Date.now() + RETRY_BASE_MS, JSON.stringify(job({ attempt: 1 })));

    expect(await queueDepth(redis)).toEqual({ pending: 2, processing: 1, retry: 1 });
  });
});
