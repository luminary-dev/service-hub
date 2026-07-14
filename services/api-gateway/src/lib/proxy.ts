import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { proxy } from "hono/proxy";
import { log } from "./log";
import { getRequestId } from "./logging";
import { isImpersonationBlocked, resolveRoute, serviceUrl } from "./routes";
import {
  IMPERSONATION_COOKIE,
  SESSION_COOKIE,
  verifyImpersonationToken,
  verifySessionToken,
} from "./session";
import { sessionVersionOk } from "./session-version";

// The gateway stamps this secret on every upstream request; if it silently fell
// back to the public dev constant in production, anyone able to reach a service
// directly could forge gateway-trusted identity headers. Fail fast (mirrors the
// AUTH_SECRET guard in session.ts).
if (!process.env.INTERNAL_API_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("INTERNAL_API_SECRET must be set in production");
}

// Upper bound on how long the gateway waits for an upstream. Without it a
// single hung service pins gateway connections indefinitely and can take down
// every route. No long-lived streams pass through the gateway (chat SSE is
// web→chat-service direct; media serves bounded files), so a flat deadline is
// safe.
const UPSTREAM_TIMEOUT_MS = 30_000;

// Hop-by-hop headers never forwarded upstream (host is re-set to the upstream).
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
];

// Trusted headers the gateway owns — anything the client sent is stripped
// before the gateway sets its own values.
const GATEWAY_HEADERS = [
  "x-user-id",
  "x-user-role",
  "x-user-name",
  "x-impersonated-by",
  "x-internal-secret",
  "x-locale",
  "x-origin",
  "x-request-id",
];

// Public web origin, forwarded so services can build absolute links (emails).
// A configured WEB_ORIGIN is authoritative and wins over everything else —
// otherwise a spoofed x-forwarded-host could poison the links in
// password-reset / verification emails (account-takeover vector). Those
// forwarding headers are client-controllable, so we only trust them in
// development (a convenience when WEB_ORIGIN is unset); in every other
// environment with no WEB_ORIGIN we fall back to a safe localhost default
// rather than a client-derived origin.
function resolveOrigin(c: Context): string {
  if (process.env.WEB_ORIGIN) return process.env.WEB_ORIGIN;
  if (process.env.NODE_ENV === "development") {
    const proto = c.req.header("x-forwarded-proto");
    const forwardedHost = c.req.header("x-forwarded-host");
    if (proto || forwardedHost) {
      const host = forwardedHost ?? c.req.header("host");
      return `${proto ?? "http"}://${host}`;
    }
  }
  return "http://localhost:3000";
}

export async function buildUpstreamHeaders(
  c: Context,
  upstreamHost: string
): Promise<Headers> {
  const headers = new Headers(c.req.raw.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  for (const name of GATEWAY_HEADERS) headers.delete(name);
  headers.set("host", upstreamHost);

  // A valid impersonation_session cookie takes priority over sh_session: the
  // admin's real cookie is left untouched (createImpersonationSession never
  // sets/clears it), so once the short-lived impersonation cookie is gone
  // (expiry or /api/admin/impersonate/end) requests fall straight back to the
  // admin's own identity below, with nothing left to reconcile.
  const impersonationToken = getCookie(c, IMPERSONATION_COOKIE);
  const impersonation = impersonationToken
    ? await verifyImpersonationToken(impersonationToken)
    : null;

  if (
    impersonation &&
    // Both parties' sessions must still be current: the target's (impersonation
    // ends if they change password etc.) AND the admin's own (#358) — so
    // force-logout / password-reset of the admin kills the impersonation now,
    // not 15 minutes later.
    (await sessionVersionOk(impersonation.userId, impersonation.sv)) &&
    (await sessionVersionOk(
      impersonation.impersonatedBy,
      impersonation.impersonatedBySv
    ))
  ) {
    headers.set("x-user-id", impersonation.userId);
    headers.set("x-user-role", impersonation.role);
    headers.set("x-user-name", encodeURIComponent(impersonation.name));
    headers.set("x-impersonated-by", impersonation.impersonatedBy);
  } else {
    // Verified session → identity headers. Invalid/absent/revoked →
    // forwarded without them (services decide 401s); never an error here.
    // Revocation: the token's sv must still match the user's current
    // sessionVersion.
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const session = await verifySessionToken(token);
      if (session && (await sessionVersionOk(session.userId, session.sv))) {
        headers.set("x-user-id", session.userId);
        headers.set("x-user-role", session.role);
        headers.set("x-user-name", encodeURIComponent(session.name));
      }
    }
  }

  headers.set(
    "x-internal-secret",
    process.env.INTERNAL_API_SECRET ?? "dev-internal-secret"
  );
  headers.set("x-locale", getCookie(c, "lang") === "si" ? "si" : "en");
  headers.set("x-origin", resolveOrigin(c));
  // The gateway-generated request id (see app.ts requestLogger) follows the
  // request across services — client-sent values were stripped above.
  headers.set("x-request-id", getRequestId(c) ?? randomUUID());

  return headers;
}

// Reverse proxy: original method/path/query/body pass through unmodified
// (including multipart); the upstream response — status and headers,
// Set-Cookie included — passes back verbatim.
//
// Request bodies are buffered rather than streamed: a one-shot inbound stream
// cannot be replayed when undici resends on a reused connection ("expected
// non-null body source"), and payloads are capped small (5MB uploads).
//
// redirect: "manual" — a reverse proxy must return upstream 3xx responses to
// the browser, not resolve them itself. fetch defaults to "follow", which for
// the OAuth start route (#398) meant the gateway chased identity's 302 to
// Google server-side and returned Google's consent HTML from the API URL — the
// browser never navigated to Google and never received the state/PKCE cookies.
// Manual keeps the Location + Set-Cookie intact for the client.
export async function proxyRequest(c: Context) {
  const url = new URL(c.req.url);
  const route = resolveRoute(url.pathname);
  if (!route) return c.json({ error: "Not found" }, 404);

  const base = serviceUrl(route.service);
  const target = `${base}${route.path}${url.search}`;
  const headers = await buildUpstreamHeaders(c, new URL(base).host);

  const method = c.req.method;

  // #634: block the irreversible self-service ops while an impersonation session
  // is in effect. buildUpstreamHeaders only sets x-impersonated-by after it has
  // verified the impersonation cookie (both parties' sessionVersions current),
  // so keying off the stamped header reuses that exact check — an expired or
  // revoked impersonation has already fallen back to the admin's own identity
  // and is not blocked.
  if (headers.get("x-impersonated-by") && isImpersonationBlocked(method, url.pathname)) {
    return c.json(
      {
        error:
          "This action is disabled while viewing as another user. End impersonation to perform it.",
      },
      403
    );
  }
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await c.req.raw.arrayBuffer();

  try {
    return await proxy(target, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    log.error("upstream request failed", {
      upstream: route.service,
      requestId: getRequestId(c),
      timedOut,
      err,
    });
    return c.json(
      { error: "Upstream service unavailable" },
      timedOut ? 504 : 502
    );
  }
}
