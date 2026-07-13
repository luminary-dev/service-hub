import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module guards against client bundles; a no-op stand-in lets node tests
// import it.
vi.mock("server-only", () => ({}));

// Fresh module (and fresh in-memory cache) per test.
let sessionVersionOk: (userId: string, sv: number) => Promise<boolean>;
let cachedUserCount: () => number;

const fetchMock = vi.fn();

function versionResponse(v: number | null) {
  return { ok: true, json: async () => ({ v }) };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  ({ sessionVersionOk, cachedUserCount } = await import("./session-version"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("sessionVersionOk", () => {
  it("accepts a token carrying the current version and caches the lookup", async () => {
    fetchMock.mockResolvedValue(versionResponse(3));
    expect(await sessionVersionOk("user-a", 3)).toBe(true);
    expect(await sessionVersionOk("user-a", 3)).toBe(true);
    // Second check inside the TTL is served from the cache.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a token minted before the current version", async () => {
    fetchMock.mockResolvedValue(versionResponse(5));
    expect(await sessionVersionOk("user-a", 4)).toBe(false);
  });

  it("fails open when the lookup is unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await sessionVersionOk("user-a", 1)).toBe(true);
  });

  // The cache must not grow one permanent entry per distinct user (#377):
  // expired entries are swept out on later checks.
  it("evicts expired entries so the cache stays bounded", async () => {
    fetchMock.mockResolvedValue(versionResponse(1));
    await sessionVersionOk("stale-1", 1);
    await sessionVersionOk("stale-2", 1);
    expect(cachedUserCount()).toBe(2);

    // Both entries age out of the TTL; the next check triggers a sweep.
    vi.advanceTimersByTime(120_000);
    await sessionVersionOk("fresh", 1);
    expect(cachedUserCount()).toBe(1);
  });
});
