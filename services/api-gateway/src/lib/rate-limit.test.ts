import { afterEach, describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import {
  checkRateLimit,
  rateLimitMiddleware,
  resolveClientIp,
  trustedProxyHops,
  LIMITED_GET_ROUTES,
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

  // #797: mobile token auth. /token verifies credentials (same guessing
  // oracle as login) and /revoke takes unauthenticated opaque tokens — both
  // strict; /refresh is routine ~15-minute per-device churn on its own
  // wider budget.
  it.each([
    ["/api/auth/token", "auth-token"],
    ["/api/auth/revoke", "auth-revoke"],
  ])("rate-limits %s on the strict auth budget", (path, name) => {
    const route = match(path);
    expect(route?.name).toBe(name);
    expect(route?.rule).toBe(RATE_LIMITS.authStrict);
  });

  it("rate-limits /api/auth/refresh on the wider authRefresh budget", () => {
    const route = match("/api/auth/refresh");
    expect(route?.name).toBe("auth-refresh");
    expect(route?.rule).toBe(RATE_LIMITS.authRefresh);
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

  // #394: notification-center writes. Mark-read fires at conversational
  // frequency (each bell open marks a page read) → the message budget; the
  // preference upsert is a settings form → the review budget.
  it("rate-limits notification mark-read on the message budget", () => {
    const route = match("/api/notifications/read");
    expect(route?.name).toBe("notification-read");
    expect(route?.rule).toBe(RATE_LIMITS.message);
  });

  it("rate-limits notification-preference upserts on the review budget", () => {
    const route = match("/api/notification-preferences");
    expect(route?.name).toBe("notification-prefs");
    expect(route?.rule).toBe(RATE_LIMITS.review);
  });

  // #656: profile-edit mutations (PUT) and the inquiry-status update (PATCH)
  // are matched by path here — the middleware now walks this table for every
  // unsafe method, not just POST.
  it("rate-limits the provider profile save on the profile budget", () => {
    const route = match("/api/provider/profile");
    expect(route?.name).toBe("provider-profile");
    expect(route?.rule).toBe(RATE_LIMITS.profile);
  });

  it("rate-limits the account profile save on the profile budget", () => {
    const route = match("/api/account/profile");
    expect(route?.name).toBe("account-profile");
    expect(route?.rule).toBe(RATE_LIMITS.profile);
  });

  it("rate-limits the inquiry-status update on the message budget", () => {
    const route = match("/api/provider/inquiries/inq_1");
    expect(route?.name).toBe("inquiry-update");
    expect(route?.rule).toBe(RATE_LIMITS.message);
  });

  // Near-miss paths must not be swept into the upload/email buckets.
  it("does not match unrelated or sibling paths", () => {
    expect(match("/api/account/email/confirm")?.name).not.toBe(
      "account-email-change"
    );
    expect(match("/api/provider/photos/order")).toBeUndefined();
    // The notification GET endpoints (feed, unread-count) are POST-only misses
    // by path too — the read routes never appear in the table.
    expect(match("/api/notifications")).toBeUndefined();
    expect(match("/api/notifications/unread-count")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// LIMITED_GET_ROUTES: the first rate-limited reads — /api/search/* is a query
// engine a scraper could walk, so it carries its own per-IP budget (search
// RFC §5). The GET table is separate from the POST table on purpose: no GET
// may ever consume a write bucket, and vice versa.
// ---------------------------------------------------------------------------
describe("LIMITED_GET_ROUTES", () => {
  const match = (path: string) =>
    LIMITED_GET_ROUTES.find((r) => r.pattern.test(path));

  it.each(["/api/search/providers", "/api/search/providers/nearby"])(
    "rate-limits %s on the search budget",
    (path) => {
      const route = match(path);
      expect(route?.name).toBe("search");
      expect(route?.rule).toBe(RATE_LIMITS.search);
    }
  );

  it("does not throttle other reads", () => {
    expect(match("/api/providers")).toBeUndefined();
    expect(match("/api/categories")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Middleware method coverage (#656): the limiter must run for every UNSAFE
// method (POST/PUT/PATCH/DELETE), not just POST — otherwise a rule can never
// protect a non-POST mutation. GET keeps its own read table; other safe
// methods (HEAD/OPTIONS) are never limited.
// ---------------------------------------------------------------------------
describe("rateLimitMiddleware method coverage", () => {
  const buildApp = () => {
    const app = new Hono();
    app.use("*", rateLimitMiddleware);
    app.all("*", (c) => c.text("ok"));
    return app;
  };

  it("throttles a PUT on a limited path (previously exempt — only POST/GET ran)", async () => {
    const app = buildApp();
    // Unique path per key: profile budget is 20 / 15 min, keyed on the
    // (test-time "unknown") client IP.
    const put = () => app.request("/api/provider/profile", { method: "PUT" });
    for (let i = 0; i < RATE_LIMITS.profile.limit; i++) {
      expect((await put()).status).not.toBe(429);
    }
    expect((await put()).status).toBe(429);
  });

  it("does not limit mutations on unlisted paths", async () => {
    const app = buildApp();
    expect((await app.request("/api/whatever", { method: "DELETE" })).status).toBe(200);
    expect((await app.request("/api/whatever", { method: "PATCH" })).status).toBe(200);
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

// The limiter now issues ONE atomic EVAL. This fake evaluates the same
// sliding-window logic in JS against an in-process sorted set, and records the
// TTL the script (P)EXPIREs the key with so tests can assert it is always set —
// the guarantee the old multi-round-trip path could lose (#768).
function fakeRedis(): RedisCommands & {
  sets: Map<string, Map<string, number>>;
  ttls: Map<string, number>;
  evalCalls: number;
} {
  const sets = new Map<string, Map<string, number>>();
  const ttls = new Map<string, number>();
  const setFor = (key: string) => {
    if (!sets.has(key)) sets.set(key, new Map());
    return sets.get(key)!;
  };
  const state = {
    sets,
    ttls,
    evalCalls: 0,
    async eval(_script: string, _numKeys: number, ...args: (string | number)[]) {
      state.evalCalls++;
      const [key, now, windowMs, windowStart, member, limit] = args as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const s = setFor(key);
      for (const [m, score] of s) {
        if (score <= Number(windowStart)) s.delete(m);
      }
      s.set(member, Number(now));
      // The script PEXPIREs on every call, so the key always carries a TTL.
      ttls.set(key, Number(windowMs));
      const count = s.size;
      if (count <= Number(limit)) {
        return [1, Number(limit) - count, 0];
      }
      s.delete(member);
      const sorted = [...s].sort((a, b) => a[1] - b[1]);
      const oldestScore = sorted.length > 0 ? sorted[0][1] : Number(now);
      const retry = Math.max(0, oldestScore + Number(windowMs) - Number(now));
      return [0, 0, retry];
    },
    async get() {
      return null;
    },
  };
  return state;
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

  it("runs the whole window as a single atomic round trip (#768)", async () => {
    const redis = fakeRedis();
    await checkRateLimitRedis(redis, "rl:atomic", rule, 1_000_000);
    // One EVAL, not the old 4-6 separate awaited commands.
    expect(redis.evalCalls).toBe(1);
  });

  it("always sets a TTL on the key, even for a blocked request (#768)", async () => {
    const redis = fakeRedis();
    const t0 = 1_000_000;
    // Exhaust the limit and then get blocked; the TTL must be present every time
    // (the old path could drop it on a mid-sequence connection failure).
    for (let i = 0; i < 4; i++) await checkRateLimitRedis(redis, "rl:ttl", rule, t0 + i);
    expect(redis.ttls.get("rl:ttl")).toBe(rule.windowMs);
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

// A RedisCommands whose EVAL always throws, forcing the fallback path — models
// an unreachable Redis (offline queue disabled: the command never leaves the
// client, so nothing is committed).
function throwingRedis(): RedisCommands {
  const boom = () => {
    throw new Error("ECONNREFUSED");
  };
  return {
    eval: boom,
    get: boom,
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
