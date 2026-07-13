import { afterEach, describe, it, expect, vi } from "vitest";
import {
  checkRateLimit,
  resolveClientIp,
  trustedProxyHops,
  LIMITED_ROUTES,
  RATE_LIMITS,
} from "./rate-limit";

const rule = { limit: 3, windowMs: 1000 };

describe("checkRateLimit (sliding window)", () => {
  it("allows up to the limit then blocks", () => {
    const key = "test:allow-then-block";
    const now = 1_000_000;
    expect(checkRateLimit(key, rule, now).success).toBe(true);
    expect(checkRateLimit(key, rule, now).success).toBe(true);
    expect(checkRateLimit(key, rule, now).success).toBe(true);
    const blocked = checkRateLimit(key, rule, now);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("reports decreasing remaining count", () => {
    const key = "test:remaining";
    const now = 2_000_000;
    expect(checkRateLimit(key, rule, now).remaining).toBe(2);
    expect(checkRateLimit(key, rule, now).remaining).toBe(1);
    expect(checkRateLimit(key, rule, now).remaining).toBe(0);
  });

  it("recovers after the window slides past old hits", () => {
    const key = "test:recover";
    const now = 3_000_000;
    checkRateLimit(key, rule, now);
    checkRateLimit(key, rule, now);
    checkRateLimit(key, rule, now);
    expect(checkRateLimit(key, rule, now).success).toBe(false);
    // Advance beyond the window — the old hits expire.
    expect(checkRateLimit(key, rule, now + rule.windowMs + 1).success).toBe(true);
  });

  it("keys are isolated from each other", () => {
    const now = 4_000_000;
    checkRateLimit("test:a", rule, now);
    checkRateLimit("test:a", rule, now);
    checkRateLimit("test:a", rule, now);
    expect(checkRateLimit("test:a", rule, now).success).toBe(false);
    expect(checkRateLimit("test:b", rule, now).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Client-IP resolution (#201): X-Forwarded-For is only trusted from the RIGHT,
// skipping exactly TRUSTED_PROXY_HOPS trusted hops. The leftmost (forgeable)
// token must never decide the rate-limit key.
// ---------------------------------------------------------------------------
describe("resolveClientIp", () => {
  const SOCKET = "198.51.100.7";

  it("uses the socket peer and ignores XFF when hops = 0", () => {
    expect(resolveClientIp("1.1.1.1, 2.2.2.2", 0, SOCKET)).toBe(SOCKET);
    // A forged XFF cannot escape the socket-peer bucket.
    expect(resolveClientIp("10.0.0.1", 0, SOCKET)).toBe(SOCKET);
    expect(resolveClientIp("10.0.0.99", 0, SOCKET)).toBe(SOCKET);
  });

  it("uses the socket peer when XFF is absent", () => {
    expect(resolveClientIp(undefined, 2, SOCKET)).toBe(SOCKET);
    expect(resolveClientIp("", 2, SOCKET)).toBe(SOCKET);
  });

  it("with hops = 1 takes the rightmost (peer-inserted) entry", () => {
    expect(resolveClientIp("203.0.113.5", 1, SOCKET)).toBe("203.0.113.5");
    // A prepended forgery is left of the trusted entry and ignored.
    expect(resolveClientIp("1.2.3.4, 203.0.113.5", 1, SOCKET)).toBe("203.0.113.5");
  });

  it("with hops = 2 skips one trusted hop from the right to reach the client", () => {
    // Real chain: client → Caddy → web → gateway. XFF = [client, caddy].
    expect(resolveClientIp("203.0.113.9, 172.16.0.2", 2, SOCKET)).toBe("203.0.113.9");
    // Client prepends junk; indexing from the right still lands on the client.
    expect(resolveClientIp("9.9.9.9, 203.0.113.9, 172.16.0.2", 2, SOCKET)).toBe(
      "203.0.113.9"
    );
  });

  it("trims whitespace and drops empty tokens", () => {
    expect(resolveClientIp(" 203.0.113.9 , 172.16.0.2 ", 2, SOCKET)).toBe(
      "203.0.113.9"
    );
    expect(resolveClientIp("203.0.113.9,,172.16.0.2", 2, SOCKET)).toBe("203.0.113.9");
  });

  it("falls back to the socket peer when the chain is shorter than hops", () => {
    // Only one entry but two trusted hops expected → not the expected topology.
    expect(resolveClientIp("203.0.113.9", 2, SOCKET)).toBe(SOCKET);
  });

  it("returns 'unknown' only when there is no trustworthy source", () => {
    expect(resolveClientIp(undefined, 0, undefined)).toBe("unknown");
    expect(resolveClientIp("203.0.113.9", 2, undefined)).toBe("unknown");
  });
});

describe("trustedProxyHops", () => {
  const OLD = process.env.TRUSTED_PROXY_HOPS;
  afterEach(() => {
    if (OLD === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = OLD;
  });

  it("defaults to 0 when unset", () => {
    expect(trustedProxyHops({})).toBe(0);
  });

  it("parses a positive integer", () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" })).toBe(2);
  });

  it("clamps negatives and rejects non-numeric values to 0", () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "-3" })).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "abc" })).toBe(0);
  });

  it("reads process.env by default", () => {
    process.env.TRUSTED_PROXY_HOPS = "3";
    expect(trustedProxyHops()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// LIMITED_ROUTES: the path→rule table the POST middleware walks. These assert
// the regexes match the real gateway routes (see lib/routes.ts) and carry the
// intended budget.
// ---------------------------------------------------------------------------
describe("LIMITED_ROUTES", () => {
  const match = (path: string) =>
    LIMITED_ROUTES.find((r) => r.pattern.test(path));

  // #505: change-email sends a confirmation to an attacker-chosen address, so
  // it sits on the email-sending (resend) budget.
  it("rate-limits change-email on the resend budget", () => {
    const route = match("/api/account/email/change");
    expect(route?.name).toBe("account-email-change");
    expect(route?.rule).toBe(RATE_LIMITS.resend);
  });

  // #520: the four image-upload POSTs share one CPU-protecting "upload" bucket.
  it.each([
    "/api/account/avatar",
    "/api/provider/photos",
    "/api/provider/verification",
    "/api/admin/categories/image",
  ])("rate-limits image upload %s on the upload budget", (path) => {
    const route = match(path);
    expect(route?.name).toBe("upload");
    expect(route?.rule).toBe(RATE_LIMITS.upload);
  });

  // #395: a provider's response to a review is a one-shot form on the same
  // budget as review submission, in its own bucket.
  it("rate-limits review responses on the review budget", () => {
    const route = match("/api/reviews/rev_1/response");
    expect(route?.name).toBe("review-response");
    expect(route?.rule).toBe(RATE_LIMITS.review);
  });

  // Near-miss paths must not be swept into the upload/email buckets.
  it("does not match unrelated or sibling paths", () => {
    expect(match("/api/account/email/confirm")?.name).not.toBe(
      "account-email-change"
    );
    expect(match("/api/provider/photos/order")).toBeUndefined();
    expect(match("/api/account/profile")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Startup misconfiguration check (#374): warn (never crash) when
// TRUSTED_PROXY_HOPS looks wrong for the deployed topology.
// ---------------------------------------------------------------------------
import { checkProxyConfig } from "./rate-limit";

describe("checkProxyConfig", () => {
  const fakeLogger = () => ({ warn: vi.fn() } as unknown as typeof import("./log").log);

  it("warns in production when hops is unset (0)", () => {
    const logger = fakeLogger();
    checkProxyConfig({ NODE_ENV: "production" }, logger);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(
      /TRUSTED_PROXY_HOPS/
    );
  });

  it("warns in production when hops is explicitly 0", () => {
    const logger = fakeLogger();
    checkProxyConfig({ NODE_ENV: "production", TRUSTED_PROXY_HOPS: "0" }, logger);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("stays quiet in production when hops is correctly set", () => {
    const logger = fakeLogger();
    checkProxyConfig({ NODE_ENV: "production", TRUSTED_PROXY_HOPS: "2" }, logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not warn outside production even when hops is 0", () => {
    const logger = fakeLogger();
    checkProxyConfig({ NODE_ENV: "development" }, logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns on a set-but-invalid value (coerces to 0) regardless of environment", () => {
    const dev = fakeLogger();
    checkProxyConfig({ NODE_ENV: "development", TRUSTED_PROXY_HOPS: "two" }, dev);
    expect(dev.warn).toHaveBeenCalledOnce();
    expect((dev.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/not a valid/);

    const negative = fakeLogger();
    checkProxyConfig({ NODE_ENV: "development", TRUSTED_PROXY_HOPS: "-2" }, negative);
    expect(negative.warn).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Redis-backed window, exercised against a minimal in-process fake that
// implements real sorted-set semantics for the commands we use.
// ---------------------------------------------------------------------------
import { checkRateLimitRedis, type RedisCommands } from "./rate-limit";

function fakeRedis(): RedisCommands & { sets: Map<string, Map<string, number>> } {
  const sets = new Map<string, Map<string, number>>();
  const setFor = (key: string) => {
    if (!sets.has(key)) sets.set(key, new Map());
    return sets.get(key)!;
  };
  return {
    sets,
    async zremrangebyscore(key, _min, max) {
      const s = setFor(key);
      let removed = 0;
      for (const [member, score] of s) {
        if (score <= Number(max)) {
          s.delete(member);
          removed++;
        }
      }
      return removed;
    },
    async zadd(key, score, member) {
      setFor(key).set(member, score);
      return 1;
    },
    async zcard(key) {
      return setFor(key).size;
    },
    async zrem(key, member) {
      return setFor(key).delete(member) ? 1 : 0;
    },
    async zrange(key, start, stop, _withScores) {
      const sorted = [...setFor(key)].sort((a, b) => a[1] - b[1]);
      return sorted.slice(start, stop + 1).flatMap(([m, s]) => [m, String(s)]);
    },
    async pexpire() {
      return 1;
    },
    async get() {
      return null;
    },
  };
}

describe("checkRateLimitRedis", () => {
  const rule = { limit: 3, windowMs: 60_000 };

  it("allows up to the limit and then blocks", async () => {
    const redis = fakeRedis();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimitRedis(redis, "rl:test", rule, t0 + i);
      expect(r.success).toBe(true);
    }
    const blocked = await checkRateLimitRedis(redis, "rl:test", rule, t0 + 10);
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("does not leave a hit behind for blocked requests", async () => {
    const redis = fakeRedis();
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) await checkRateLimitRedis(redis, "rl:x", rule, t0 + i);
    // 3 allowed hits remain; the blocked one removed itself.
    expect(redis.sets.get("rl:x")!.size).toBe(3);
  });

  it("frees slots once old hits leave the window", async () => {
    const redis = fakeRedis();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimitRedis(redis, "rl:y", rule, t0 + i);
    expect((await checkRateLimitRedis(redis, "rl:y", rule, t0 + 100)).success).toBe(false);
    const later = await checkRateLimitRedis(redis, "rl:y", rule, t0 + rule.windowMs + 5);
    expect(later.success).toBe(true);
  });

  it("reports retry-after based on the oldest hit in the window", async () => {
    const redis = fakeRedis();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimitRedis(redis, "rl:z", rule, t0 + i * 1000);
    const blocked = await checkRateLimitRedis(redis, "rl:z", rule, t0 + 5000);
    // Oldest hit at t0 leaves the window at t0 + 60000 → 55000ms from t0+5000.
    expect(blocked.retryAfterMs).toBe(55_000);
  });
});

// ---------------------------------------------------------------------------
// Redis→in-memory fallback observability (#374, security audit M4). A Redis
// outage must still limit (per-instance) AND emit exactly one warning on the
// transition into the degraded state — never one per request, which would
// flood the logs while Redis is down.
// ---------------------------------------------------------------------------
import { resolveRateLimit, resetRedisDegradedState } from "./rate-limit";
import { log } from "./log";

// A RedisCommands whose first op always throws, forcing the fallback path.
function throwingRedis(): RedisCommands {
  const boom = () => {
    throw new Error("ECONNREFUSED");
  };
  return {
    zremrangebyscore: boom,
    zadd: boom,
    zcard: boom,
    zrem: boom,
    zrange: boom,
    pexpire: boom,
  } as unknown as RedisCommands;
}

describe("resolveRateLimit fallback observability", () => {
  const rule = { limit: 3, windowMs: 1000 };

  afterEach(() => {
    resetRedisDegradedState();
    vi.restoreAllMocks();
  });

  it("falls back to the in-memory limiter when Redis errors", async () => {
    const redis = throwingRedis();
    const key = "fallback:works";
    // In-memory limiter still enforces the rule across the fallback path.
    for (let i = 0; i < 3; i++) {
      expect((await resolveRateLimit(redis, key, rule)).success).toBe(true);
    }
    expect((await resolveRateLimit(redis, key, rule)).success).toBe(false);
  });

  it("warns once on the transition into degraded state, not per request", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    const redis = throwingRedis();
    for (let i = 0; i < 5; i++) {
      await resolveRateLimit(redis, "fallback:warn-once", rule);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    // Error and key context are included for triage.
    const [, fields] = warn.mock.calls[0];
    expect(fields).toMatchObject({ err: expect.any(Error) });
  });

  it("logs recovery once when Redis succeeds again after degrading", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const key = "fallback:recovers";

    // Degrade first.
    await resolveRateLimit(throwingRedis(), key, rule);
    expect(warn).toHaveBeenCalledTimes(1);

    // A healthy Redis fake now succeeds — recovery logs exactly once.
    const healthy = fakeRedis();
    await resolveRateLimit(healthy, key, rule);
    await resolveRateLimit(healthy, key, rule);
    expect(info).toHaveBeenCalledTimes(1);
  });
});
