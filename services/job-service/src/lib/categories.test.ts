// Unit tests for the cached category validator. The fetcher is injected so no
// DB or network is needed — identical copy in identity-, provider- and
// job-service (same rationale as field-rules).
import { describe, expect, it, vi } from "vitest";
import { createCategoryValidator } from "./categories";

describe("createCategoryValidator", () => {
  it("accepts a fetched slug and rejects an unknown one", async () => {
    const v = createCategoryValidator(async () => ["solar-installer"]);
    expect(await v.isValidCategory("solar-installer")).toBe(true);
    expect(await v.isValidCategory("astronaut")).toBe(false);
  });

  it("caches the slug set within the TTL (one fetch for many checks)", async () => {
    const fetcher = vi.fn(async () => ["plumber", "mechanic"]);
    const v = createCategoryValidator(fetcher);
    expect(await v.isValidCategory("plumber")).toBe(true);
    expect(await v.isValidCategory("mechanic")).toBe(true);
    expect(await v.isValidCategory("nope")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => ["plumber"]);
      const v = createCategoryValidator(fetcher, 60_000);
      expect(await v.isValidCategory("plumber")).toBe(true);
      vi.advanceTimersByTime(61_000);
      expect(await v.isValidCategory("plumber")).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the static CATEGORIES list when the fetch fails", async () => {
    const v = createCategoryValidator(async () => {
      throw new Error("boom");
    });
    expect(await v.isValidCategory("plumber")).toBe(true); // static list
    expect(await v.isValidCategory("astronaut")).toBe(false);
  });

  it("treats an empty result as a failure (static fallback)", async () => {
    const v = createCategoryValidator(async () => []);
    expect(await v.isValidCategory("mechanic")).toBe(true); // static list
  });

  it("keeps serving the stale cache when a refetch fails", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const v = createCategoryValidator(async () => {
        calls += 1;
        if (calls > 1) throw new Error("down");
        return ["solar-installer"];
      }, 60_000);
      expect(await v.isValidCategory("solar-installer")).toBe(true);
      vi.advanceTimersByTime(61_000);
      // Fetch now fails, but the previously cached dynamic set wins over static.
      expect(await v.isValidCategory("solar-installer")).toBe(true);
      expect(await v.isValidCategory("plumber")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clearCache forces a refetch", async () => {
    const fetcher = vi.fn(async () => ["plumber"]);
    const v = createCategoryValidator(fetcher);
    await v.isValidCategory("plumber");
    v.clearCache();
    await v.isValidCategory("plumber");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
