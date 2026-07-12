import crypto from "crypto";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// Change-email confirmation links are security-sensitive (they move the
// address a reset/verify lands on), so they expire on the shorter window.
export const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Returns a raw token (sent to the user) and its sha256 hash (stored in the DB).
// We never store the raw token, so a database leak cannot be used to reset accounts.
export function createToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
