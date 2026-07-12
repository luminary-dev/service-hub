import { beforeEach, describe, expect, it, vi } from "vitest";

// Fresh module (and fresh in-memory map) per test.
let rateLimited: (userId: string, now?: number) => boolean;
let trackedUserCount: () => number;
let RATE_LIMIT: number;
let RATE_WINDOW_MS: number;

beforeEach(async () => {
  vi.resetModules();
  ({ rateLimited, trackedUserCount, RATE_LIMIT, RATE_WINDOW_MS } = await import(
    "./rate-limit"
  ));
});

describe("chat assistant rate limiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect(rateLimited("user-a", t0 + i)).toBe(false);
    }
    // The next request in the same window is over budget.
    expect(rateLimited("user-a", t0 + RATE_LIMIT)).toBe(true);
  });

  it("prunes users whose most recent hit has aged out of the window", () => {
    const t0 = 1_000_000;
    rateLimited("stale", t0);
    expect(trackedUserCount()).toBe(1);

    // A later request from a different user (past the sweep throttle) triggers
    // a sweep that drops the aged-out "stale" entry — the map does not grow
    // unbounded across distinct users.
    rateLimited("fresh", t0 + RATE_WINDOW_MS + 1);
    expect(trackedUserCount()).toBe(1);
    expect(rateLimited("fresh", t0 + RATE_WINDOW_MS + 2)).toBe(false);
  });

  it("keeps a still-active user when a sweep runs", () => {
    const t0 = 1_000_000;
    rateLimited("active", t0);
    rateLimited("active", t0 + 100); // recent hit, well inside the window

    // Another user arrives after the throttle interval, forcing a sweep; the
    // active user's recent hit keeps it in the map.
    rateLimited("other", t0 + RATE_WINDOW_MS + 50);
    expect(trackedUserCount()).toBe(2);
  });
});
