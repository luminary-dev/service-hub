// Per-account lockout policy. Complements the gateway's per-IP throttle: a
// distributed attack on one account rotates IPs, so the account itself must
// back off. Pure so the policy can be unit-tested without a database.

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60_000;

// Admin-initiated lock (#220): reuses the same `lockedUntil` column as the
// automatic failed-login lockout above — isLockedOut() already treats any
// future date as locked — instead of adding a separate boolean column. Far
// enough out to read as "locked until an admin explicitly unlocks it".
export const MANUAL_LOCK_UNTIL = new Date("9999-12-31T00:00:00.000Z");

// True while the account is inside a lockout window. Locked accounts get the
// same "Invalid email or password" 401 as a wrong password — a distinct
// "account locked" message would confirm the account exists (enumeration).
export function isLockedOut(lockedUntil: Date | null, now = new Date()): boolean {
  return lockedUntil !== null && lockedUntil > now;
}

// State transition for a failed attempt. At the threshold the account locks
// for LOCKOUT_MS; each further failure after a window expires re-locks
// immediately (the count only resets on a successful login).
export function recordFailure(
  failedLogins: number,
  now = new Date()
): { failedLogins: number; lockedUntil: Date | null } {
  const failed = failedLogins + 1;
  return {
    failedLogins: failed,
    lockedUntil:
      failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCKOUT_MS) : null,
  };
}
