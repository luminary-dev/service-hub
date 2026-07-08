import { afterEach, describe, it, expect } from "vitest";
import { checkRateLimit, resolveClientIp, trustedProxyHops } from "./rate-limit";

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
