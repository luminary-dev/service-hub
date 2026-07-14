import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionVersionCache,
  resetRevocationRedisState,
  sessionVersionOk,
} from "./session-version";

// A minimal Redis stub exposing only `get` (the surface session-version uses).
function redisWith(entries: Record<string, string | null>) {
  return {
    get: vi.fn(async (key: string) => entries[key] ?? null),
  };
}

function throwingRedis() {
  return {
    get: vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }),
  };
}

// Stub the identity S2S lookup (global fetch) with a given JSON `v`, or make it
// throw to simulate an identity-service outage.
function stubIdentityVersion(v: number | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ v }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  );
}

function stubIdentityDown() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("fetch failed: ECONNREFUSED");
    })
  );
}

describe("sessionVersionOk — Redis revocation list first (#374)", () => {
  beforeEach(() => {
    clearSessionVersionCache();
    resetRevocationRedisState();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects a token below the Redis min-version even when identity is unreachable", async () => {
    stubIdentityDown(); // identity lookup would fail open — must not be reached
    const redis = redisWith({ "revocation:u1": "2" });
    // Token minted at v1, revocation list says min-valid is v2 → revoked.
    expect(await sessionVersionOk("u1", 1, redis)).toBe(false);
    // Authoritative: the identity fallback was never consulted.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts a token at/above the Redis min-version without calling identity", async () => {
    stubIdentityDown();
    const redis = redisWith({ "revocation:u2": "3" });
    expect(await sessionVersionOk("u2", 3, redis)).toBe(true);
    expect(await sessionVersionOk("u2", 4, redis)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes a token with no revocation entry (falls back to the identity check)", async () => {
    stubIdentityVersion(0); // never revoked → current version 0
    const redis = redisWith({}); // no entry for this user
    expect(await sessionVersionOk("u3", 0, redis)).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("still fails open for a no-entry user when identity is down", async () => {
    stubIdentityDown();
    const redis = redisWith({}); // no revocation entry
    // No Redis verdict + identity unreachable → availability wins.
    expect(await sessionVersionOk("u4", 5, redis)).toBe(true);
  });

  it("falls back to the identity check when Redis itself is down", async () => {
    stubIdentityVersion(2);
    const redis = throwingRedis();
    // Redis.get throws → treated as no verdict → identity lookup decides.
    expect(await sessionVersionOk("u5", 1, redis)).toBe(false); // 1 < 2
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("skips Redis entirely when no client is configured", async () => {
    stubIdentityVersion(1);
    expect(await sessionVersionOk("u6", 1, null)).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
