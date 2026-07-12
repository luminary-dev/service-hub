import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publishRevocation,
  REVOCATION_KEY_PREFIX,
  REVOCATION_TTL_MS,
  type RevocationStore,
} from "./revocation";
import { log } from "./log";

function fakeRedis() {
  return {
    set: vi.fn(async () => "OK"),
  } satisfies RevocationStore;
}

describe("publishRevocation (#374)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes revocation:<userId> = min-valid version with the session-lifetime TTL", async () => {
    const redis = fakeRedis();
    await publishRevocation("user-1", 3, redis);
    expect(redis.set).toHaveBeenCalledWith(
      `${REVOCATION_KEY_PREFIX}user-1`,
      "3",
      "PX",
      REVOCATION_TTL_MS
    );
  });

  it("uses the > 7-day TTL so an entry outlives any token minted before the bump", () => {
    expect(REVOCATION_TTL_MS).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it("is a no-op (no throw) when Redis is not configured", async () => {
    await expect(publishRevocation("user-2", 1, null)).resolves.toBeUndefined();
  });

  it("swallows and logs a Redis failure rather than throwing (best-effort)", async () => {
    const err = new Error("ECONNREFUSED");
    const redis: RevocationStore = {
      set: vi.fn(async () => {
        throw err;
      }),
    };
    const errSpy = vi.spyOn(log, "error").mockImplementation(() => {});
    await expect(publishRevocation("user-3", 2, redis)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledOnce();
    expect(errSpy.mock.calls[0][1]).toMatchObject({ userId: "user-3", minValidVersion: 2 });
  });
});
