// Canonical structured logging — every service (gateway included) keeps an
// identical copy at src/lib/logging.ts (services are self-contained; no shared
// package — same convention as http.ts). Each service instantiates its own
// logger in src/lib/log.ts via createLogger("<service-name>").
//
// One JSON line per event on stdout: { level, time, service, msg, ...fields }.
// Request logging: requestLogger() emits one line per request with
// method/path/status/durationMs and a requestId. The gateway generates the
// request id and propagates it upstream as x-request-id (see the gateway's
// lib/proxy.ts); services honor the header so one id follows a request across
// services. /healthz is never logged — compose healthchecks poll every 5s and
// the lines are pure noise.
import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { captureException } from "./errors";

export type LogFields = Record<string, unknown>;
export type LogWriter = (line: string) => void;

export type Logger = {
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
};

// Errors serialize to {} with plain JSON.stringify (their properties are
// non-enumerable) — flatten them so `log.error(msg, { err })` stays useful.
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

const stdoutWriter: LogWriter = (line) => {
  process.stdout.write(line + "\n");
};

// `write` is injectable for tests; production always writes to stdout.
export function createLogger(
  service: string,
  write: LogWriter = stdoutWriter
): Logger {
  const emit = (level: "info" | "warn" | "error", msg: string, fields?: LogFields) => {
    const entry = { level, time: new Date().toISOString(), service, msg, ...fields };
    let line: string;
    try {
      line = JSON.stringify(entry, jsonReplacer);
    } catch {
      // Circular or otherwise unserializable fields must never break logging —
      // fall back to the envelope alone.
      line = JSON.stringify({
        level: entry.level,
        time: entry.time,
        service: entry.service,
        msg: entry.msg,
        logError: "unserializable log fields",
      });
    }
    write(line);
  };
  return {
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}

export type RequestLoggerOptions = {
  // Services trust x-request-id — it arrives from the gateway. The gateway
  // itself sits on the public edge and passes false, so a client-sent id is
  // never honored (the gateway strips it upstream too; see GATEWAY_HEADERS).
  trustRequestId?: boolean;
};

// One structured line per completed request. The resolved request id is stored
// on the context so downstream code (e.g. the gateway proxy, onError) can read
// it via getRequestId().
export function requestLogger(
  log: Logger,
  opts: RequestLoggerOptions = {}
): MiddlewareHandler {
  const trust = opts.trustRequestId ?? true;
  return async (c, next) => {
    const incoming = trust ? c.req.header("x-request-id") : undefined;
    const requestId = incoming ?? randomUUID();
    c.set("requestId", requestId);
    const start = Date.now();
    await next();
    if (c.req.path === "/healthz") return;
    log.info("request", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  };
}

export function getRequestId(c: Context): string | undefined {
  return c.get("requestId");
}

// Last-resort process-level error capture (#34). Hono's onError covers request
// handlers; these hooks cover everything else — fire-and-forget promises,
// timers, event emitters. Each logs one structured line, then exits 1 shortly
// after: Node's default for both events is already a crash (fail fast; compose
// `restart: unless-stopped` brings the container back), so the handlers only
// change *what gets written*, not whether we die. The exit is delayed a beat
// because process.exit() can truncate pending stdout writes when stdout is a
// pipe — under Docker it always is, and the whole point is getting the line
// out. The error-monitoring backend (self-hosted GlitchTip, #34) hooks in here
// and in each app's onError via captureException (src/lib/errors.ts) — a no-op
// until SENTRY_DSN is set, so this stays a pure structured-logging path in dev.
const EXIT_FLUSH_MS = 100;

export type ProcessLike = {
  on: (
    event: "uncaughtException" | "unhandledRejection",
    listener: (reason: unknown) => void
  ) => unknown;
  exit: (code: number) => void;
};

// `proc` is injectable for tests; production always hooks the real process.
export function installProcessErrorHandlers(
  log: Logger,
  proc: ProcessLike = process
): void {
  const fail = (msg: string) => (reason: unknown) => {
    // Rejection reasons aren't necessarily Errors — normalize so the line
    // always carries err.name/message/stack.
    const err = reason instanceof Error ? reason : new Error(String(reason));
    log.error(msg, { err });
    // Report to the error backend before we exit (no-op if SENTRY_DSN unset).
    captureException(err, { fatal: msg });
    setTimeout(() => proc.exit(1), EXIT_FLUSH_MS);
  };
  proc.on("uncaughtException", fail("uncaught exception"));
  proc.on("unhandledRejection", fail("unhandled rejection"));
}
