import * as Sentry from "@sentry/nextjs";

// Client-side error reporting (#760). The two client error boundaries
// (global-error.tsx, RouteError.tsx) previously handled crashes with a bare
// console.error that only ever landed in the user's own browser console. This
// reports them to the same GlitchTip project as the server runtime.
//
// Initialisation is lazy and gated on NEXT_PUBLIC_SENTRY_DSN: with no DSN this
// is a no-op, so nothing changes in dev/CI/pre-provision. We init on first use
// (an error boundary mounting) rather than via instrumentation-client.ts so the
// SDK isn't loaded into the happy-path client bundle at all when unused.
let initialised = false;

function ensureInit(): boolean {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return false;
  if (!initialised) {
    Sentry.init({ dsn, tracesSampleRate: 0, environment: process.env.NODE_ENV });
    initialised = true;
  }
  return true;
}

// Report a client-side error to Sentry/GlitchTip. Safe to call unconditionally —
// it no-ops without a DSN. Returns the Sentry event id when captured.
export function reportClientError(error: unknown): string | undefined {
  if (!ensureInit()) return undefined;
  return Sentry.captureException(error);
}
