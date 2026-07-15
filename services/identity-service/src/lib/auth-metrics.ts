// identity-specific auth metrics (#759). Kept OUT of lib/metrics.ts, which is a
// byte-identical shared copy across every service (guarded by
// shared-copies.test.ts) and therefore can't carry service-specific series.
//
// Registered on prom-client's DEFAULT registry — the same one lib/metrics.ts's
// metricsHandler serializes at GET /metrics — so this counter is scraped
// alongside the RED metrics with no extra wiring.
import { Counter } from "prom-client";

// Incremented once per rejected credential attempt on POST /api/auth/login, so
// a credential-stuffing run is countable in Prometheus/Loki. `reason`
// distinguishes an ordinary wrong password from an attempt against a locked
// account. No per-user/email/IP labels — that would explode cardinality and
// re-introduce the PII the log lines deliberately omit (the gateway attaches
// the client IP to its own request log line, #759).
export const loginFailuresTotal = new Counter({
  name: "login_failures_total",
  help: "Total number of rejected login attempts, by reason.",
  labelNames: ["reason"],
});
