// Cloudflare Turnstile server-side verification (#633).
//
// Registration keeps auto-login (#373's response shape is unchanged), so the
// taken-vs-fresh-email response still differs. Rather than removing auto-login,
// we blunt the enumeration ORACLE by putting a bot barrier in front of it: an
// attacker can no longer script the endpoint to probe thousands of addresses.
//
// Degrades gracefully: when TURNSTILE_SECRET_KEY is unset (dev/local, and any
// deploy where keys haven't been provisioned yet) verification is DISABLED and
// the endpoint behaves exactly as before. When the secret IS set, a valid
// widget token is required — the server calls Cloudflare's siteverify to
// confirm it before doing any account work.
import { log } from "./log";

// Cloudflare's token-verification endpoint.
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Whether server-side verification is active. Unset secret → disabled (the
// graceful-degradation path). Injectable env keeps this unit-testable.
export function turnstileEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

export type TurnstileResult =
  | { ok: true }
  // missing  — enabled but the caller sent no token (a scripted client, or a
  //            browser that didn't complete the challenge)
  // invalid  — token rejected by Cloudflare (expired/replayed/forged)
  // unavailable — siteverify itself was unreachable; fail CLOSED so the barrier
  //            can't be bypassed by knocking Cloudflare offline, but surface a
  //            retryable status rather than a hard 400.
  | { ok: false; reason: "missing" | "invalid" | "unavailable" };

// Verify a Turnstile token. Returns { ok: true } when verification is disabled
// (no secret) so callers can treat "disabled" and "passed" identically.
export async function verifyTurnstile(
  token: string | undefined,
  opts: {
    secret?: string;
    remoteip?: string;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<TurnstileResult> {
  const secret = opts.secret ?? process.env.TURNSTILE_SECRET_KEY;
  // Disabled → behave exactly as before this feature existed.
  if (!secret) return { ok: true };
  if (!token) return { ok: false, reason: "missing" };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  // remoteip is optional — Cloudflare uses it as an extra signal when present.
  if (opts.remoteip) form.set("remoteip", opts.remoteip);

  try {
    const res = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      // Bound the round-trip so a slow siteverify can't hang registration.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log.error("turnstile siteverify non-2xx", {
        context: "turnstile",
        status: res.status,
      });
      return { ok: false, reason: "unavailable" };
    }
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
    } | null;
    return data?.success ? { ok: true } : { ok: false, reason: "invalid" };
  } catch (e) {
    // Network error / timeout — fail closed (the barrier stays up) but as a
    // retryable "unavailable", not a validation error.
    log.error("turnstile siteverify failed", { context: "turnstile", err: e });
    return { ok: false, reason: "unavailable" };
  }
}
