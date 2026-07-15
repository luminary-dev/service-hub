// Canonical Prometheus metrics — every service (gateway included) keeps an
// identical copy at src/lib/metrics.ts (services are self-contained; no shared
// package — same convention as http.ts / logging.ts, enforced by
// src/lib/shared-copies.test.ts at the repo root).
//
// Exposes three things, wired into each app the same way requestLogger/healthz
// are (see src/app.ts and src/index.ts):
//   - initMetrics(service): called once at startup (index.ts) to stamp the
//     service label and start Node/process default metrics (event-loop lag,
//     heap, GC, fds, ...). Kept out of app.ts so importing the app in tests
//     never starts the default-metrics timer.
//   - metricsMiddleware(): one RED observation (rate/errors/duration) per
//     completed request — an http_request_duration_seconds histogram plus an
//     http_requests_total counter, labelled by method/route/status.
//   - metricsHandler: the GET /metrics scrape endpoint. It is deliberately
//     mounted BEFORE requireInternalSecret so Prometheus can scrape it without
//     the internal secret; the service port is never exposed publicly (loopback
//     in dev, backend-only network in prod), so this stays internal-only.
import type { Context, MiddlewareHandler } from "hono";
import {
  Counter,
  Histogram,
  collectDefaultMetrics,
  register,
} from "prom-client";

// Stamp every metric with the service name and start default process/runtime
// metrics on the default registry. Call once from index.ts (the real server
// entry) with the service's own name, e.g. initMetrics("identity-service").
export function initMetrics(service: string): void {
  register.setDefaultLabels({ service });
  collectDefaultMetrics();
}

// Registered on prom-client's default registry (no explicit `registers`), which
// metricsHandler serializes. Buckets span sub-millisecond to 10s to cover both
// fast reads and the slower S2S write paths.
const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds, by method, route and status.",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests, by method, route and status.",
  labelNames: ["method", "route", "status"],
});

// One RED observation per completed request. Mirrors requestLogger: it times
// across `await next()`, so Hono's onError has already turned a thrown handler
// into a real response by the time we read the status.
export function metricsMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Skip the scrape endpoint (self-referential noise) and the healthchecks
    // (compose polls /healthz every few seconds — the same reason requestLogger
    // drops it), so request rate reflects real traffic.
    if (c.req.path === "/metrics" || c.req.path === "/healthz") {
      await next();
      return;
    }
    const stop = httpRequestDuration.startTimer();
    await next();
    // Label with the matched route PATTERN (e.g. /api/admin/users/:id), never
    // the raw path, so id-bearing paths don't explode the label cardinality.
    // routePath throws when nothing matched (a 404) — bucket those together.
    let route: string;
    try {
      route = c.req.routePath;
    } catch {
      route = "unmatched";
    }
    const labels = { method: c.req.method, route, status: String(c.res.status) };
    stop(labels);
    httpRequestsTotal.inc(labels);
  };
}

// Prometheus scrape endpoint. NOT behind requireInternalSecret by design (see
// the file header): Prometheus scrapes it directly over the internal network.
export async function metricsHandler(c: Context): Promise<Response> {
  return c.body(await register.metrics(), 200, {
    "content-type": register.contentType,
  });
}
