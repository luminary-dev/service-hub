import { describe, it, expect } from "vitest";
import {
  isLockedOut,
  recordFailure,
  LOCKOUT_MS,
  MAX_FAILED_LOGINS,
} from "./lockout";

const NOW = new Date("2026-07-04T12:00:00Z");

describe("isLockedOut", () => {
  it("is false with no lockout", () => {
    expect(isLockedOut(null, NOW)).toBe(false);
  });

  it("is true while inside the window", () => {
    expect(isLockedOut(new Date(NOW.getTime() + 1), NOW)).toBe(true);
  });

  it("is false once the window has passed", () => {
    expect(isLockedOut(new Date(NOW.getTime() - 1), NOW)).toBe(false);
    expect(isLockedOut(NOW, NOW)).toBe(false);
  });
});

describe("recordFailure", () => {
  it("counts failures without locking below the threshold", () => {
    const s = recordFailure(0, NOW);
    expect(s).toEqual({ failedLogins: 1, lockedUntil: null });
    expect(recordFailure(MAX_FAILED_LOGINS - 2, NOW).lockedUntil).toBeNull();
  });

  it("locks at the threshold", () => {
    const s = recordFailure(MAX_FAILED_LOGINS - 1, NOW);
    expect(s.failedLogins).toBe(MAX_FAILED_LOGINS);
    expect(s.lockedUntil).toEqual(new Date(NOW.getTime() + LOCKOUT_MS));
  });

  it("re-locks immediately on failures after an expired window", () => {
    // failedLogins stays >= threshold after a lockout expires, so one more
    // wrong password re-locks — progressive backoff without extra state.
    const s = recordFailure(MAX_FAILED_LOGINS, NOW);
    expect(s.failedLogins).toBe(MAX_FAILED_LOGINS + 1);
    expect(s.lockedUntil).toEqual(new Date(NOW.getTime() + LOCKOUT_MS));
  });
});
