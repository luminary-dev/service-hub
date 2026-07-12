import { describe, it, expect } from "vitest";
import {
  isLockedOut,
  lockUntilFor,
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

describe("lockUntilFor", () => {
  // The argument is the post-increment count (the value the DB returns after an
  // atomic `{ increment: 1 }`), not the pre-read snapshot.
  it("does not lock below the threshold", () => {
    expect(lockUntilFor(1, NOW)).toBeNull();
    expect(lockUntilFor(MAX_FAILED_LOGINS - 1, NOW)).toBeNull();
  });

  it("locks at the threshold", () => {
    expect(lockUntilFor(MAX_FAILED_LOGINS, NOW)).toEqual(
      new Date(NOW.getTime() + LOCKOUT_MS)
    );
  });

  it("re-locks immediately on failures after an expired window", () => {
    // failedLogins stays >= threshold after a lockout expires, so one more
    // wrong password re-locks — progressive backoff without extra state.
    expect(lockUntilFor(MAX_FAILED_LOGINS + 1, NOW)).toEqual(
      new Date(NOW.getTime() + LOCKOUT_MS)
    );
  });
});
