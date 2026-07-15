// Canonical error capture — every backend service (gateway included) keeps an
// identical copy at src/lib/errors.ts (services are self-contained; no shared
// package — same convention as http.ts / logging.ts / metrics.ts, enforced by
// src/lib/shared-copies.test.ts at the repo root).
//
// Ships unhandled errors to a Sentry-compatible backend (self-hosted GlitchTip,
// #34) so a crash, rejection, or 500 surfaces with a stack trace and context
// instead of scrolling past in the logs. Wired into the two choke points the
// logging module already owns: each Hono app's `onError` (errors raised inside
// a request — see src/app.ts) and `installProcessErrorHandlers` (everything
// else — uncaught exceptions / unhandled rejections, see src/lib/logging.ts).
//
// GRACEFUL DEGRADATION IS MANDATORY. With SENTRY_DSN unset — the default on
// every dev machine and in CI — initErrorCapture() does NOTHING: no SDK is
// initialised, no network connection is opened, and captureException() is a
// pure no-op. Shipping this changes no behavior until an operator provisions a
// DSN, exactly like the Unleash token / Turnstile keys.
import * as Sentry from "@sentry/node";

// Flipped true only once init succeeds with a DSN present. captureException()
// gates on it so it stays a no-op both before init and when capture is disabled.
let enabled = false;

// Call once at startup from src/index.ts with the service's own name, e.g.
// initErrorCapture("identity-service"). MUST run before
// installProcessErrorHandlers so a process-level capture has an initialised
// client. Idempotent and non-throwing: error capture is best-effort telemetry,
// never a boot dependency — a bad DSN or an init failure must not stop the
// service from starting.
export function initErrorCapture(service: string): void {
  if (enabled) return;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return; // unset → pure no-op: no init, no network.
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      serverName: service,
      // We run our OWN uncaughtException / unhandledRejection handlers
      // (src/lib/logging.ts): they log one structured line and exit the
      // process. Drop Sentry's equivalents so the SDK only reports what we hand
      // it via captureException() and never races or overrides our exit path.
      integrations: (defaults) =>
        defaults.filter(
          (i) =>
            i.name !== "OnUncaughtException" && i.name !== "OnUnhandledRejection"
        ),
      // Error capture only — distributed tracing is the other #668 follow-up.
      tracesSampleRate: 0,
    });
    Sentry.setTag("service", service);
    enabled = true;
  } catch {
    // Telemetry init must never break startup — stay disabled and silent.
    enabled = false;
  }
}

// Report an error to the backend. A no-op until initErrorCapture() has run with
// a DSN set. NEVER throws: it runs on paths that are already handling an error
// (onError, the process handlers), so a capture failure must not become a new
// error there.
export function captureException(
  err: unknown,
  context?: Record<string, unknown>
): void {
  if (!enabled) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // Best-effort — swallow.
  }
}
