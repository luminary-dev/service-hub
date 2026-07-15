// Canonical distributed-tracing bootstrap (#668, tracing follow-up) — every
// backend service (gateway included) keeps an identical copy at src/tracing.ts
// (services are self-contained; no shared package — same convention as
// src/lib/logging.ts / errors.ts / metrics.ts, enforced by
// src/lib/shared-copies.test.ts at the repo root).
//
// Loaded via NODE_OPTIONS=--require ./dist/tracing.js so it runs BEFORE the app
// requires http/pg/ioredis and OpenTelemetry's auto-instrumentation can patch
// them. It is deliberately NOT part of the default boot: the base Dockerfile
// CMD and a plain `docker compose up` (what CI's e2e/playwright boot) never set
// that NODE_OPTIONS, so nothing here loads there and the boot path is untouched.
// Tracing is turned on only in docker-compose.prod.yml and behind the opt-in
// dev `tracing` compose profile.
//
// GRACEFUL DEGRADATION IS MANDATORY. With OTEL_EXPORTER_OTLP_ENDPOINT unset —
// the default everywhere except an explicitly-enabled stack — startTracing()
// does NOTHING: no SDK is created, no exporter, no network connection. So even
// if this module is loaded, an unset endpoint keeps it a pure no-op (mirrors
// errors.ts gating on SENTRY_DSN). NEVER throws: telemetry is best-effort and
// must never be a boot dependency.
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | undefined;

// Start the OpenTelemetry SDK with auto-instrumentation (HTTP server + client,
// undici/fetch for S2S, pg/Prisma, ioredis) exporting OTLP/HTTP to the
// collector at OTEL_EXPORTER_OTLP_ENDPOINT. Returns true when tracing was
// actually started, false on the no-op path. Idempotent.
export function startTracing(): boolean {
  if (sdk) return true;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return false; // unset → pure no-op: no SDK, no exporter, no network.
  // Only the long-lived app process should own a tracer. NODE_OPTIONS applies
  // to EVERY node invocation in the container — `npm`, `prisma migrate deploy`
  // — and those short-lived processes must not stand up an exporter and leak a
  // half-flushed batch of spans. The app always boots via `node dist/index.js`.
  const entry = process.argv[1];
  if (!entry || !entry.endsWith("dist/index.js")) return false;
  try {
    // service.name comes from OTEL_SERVICE_NAME (baked into each service's
    // Dockerfile), so this file stays byte-identical across services. The OTLP
    // exporter reads OTEL_EXPORTER_OTLP_ENDPOINT and POSTs to <endpoint>/v1/traces.
    sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Filesystem spans are pure noise for a web service.
          "@opentelemetry/instrumentation-fs": { enabled: false },
          // Stamp the propagated request id (x-request-id — see
          // src/lib/logging.ts) onto the HTTP spans so a trace links back to
          // the JSON log lines that carry the same id.
          "@opentelemetry/instrumentation-http": {
            headersToSpanAttributes: {
              server: { requestHeaders: ["x-request-id"] },
              client: { requestHeaders: ["x-request-id"] },
            },
          },
        }),
      ],
    });
    sdk.start();
    // Flush + shut the tracer down on the same signals index.ts drains on, so
    // the final batch of spans is exported instead of dropped on exit.
    const stop = () => {
      void sdk?.shutdown().catch(() => {});
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    return true;
  } catch {
    // Telemetry init must never break startup — stay disabled and silent.
    sdk = undefined;
    return false;
  }
}

// Auto-start when loaded via --require/--import at process boot.
startTracing();
