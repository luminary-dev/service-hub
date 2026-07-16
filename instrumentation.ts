// Web-tier observability (#760). Until now the Next.js app was an error-
// reporting blind spot: SSR failures and client crashes reported nothing while
// all ten backend services shipped to GlitchTip. This wires the server/edge
// runtimes to a second GlitchTip project (a Sentry-compatible DSN) and exports
// onRequestError so Next forwards every SSR/RSC error — with its `digest` (the
// "Error ID" surfaced to the user) — to the same place.
//
// Everything is gated on SENTRY_DSN: with no DSN (dev, CI, a pre-provision
// prod) Sentry.init is a no-op, so the app behaves exactly as before and the
// production build never needs network access or a DSN.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    Sentry.init({
      dsn,
      // Error capture only — no perf tracing (the backend owns request tracing;
      // the web tier just needs the error + request-id correlation).
      tracesSampleRate: 0,
      environment: process.env.NODE_ENV,
    });
  }
}

// Next calls this for every SSR/RSC/route-handler error. Sentry's helper tags
// the event with the request context and the error `digest`, so a user-reported
// "Error ID" ties straight to the captured event (and, via ApiError.requestId,
// to the gateway/service log chain).
export const onRequestError = Sentry.captureRequestError;
