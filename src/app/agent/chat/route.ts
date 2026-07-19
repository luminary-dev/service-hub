// Thin streaming proxy to chat-service (#11). The assistant itself — the
// ANTHROPIC_API_KEY, the Claude tool loop, the personas — lives in
// chat-service (internal, behind the internal secret). This route forwards
// the browser's message body plus the locale, and pipes the SSE stream
// straight back. The assistant never acts on the user's behalf (it only
// searches the public directory and proposes drafts the user confirms in the
// app), so no session cookie is forwarded into the LLM-driven service. Kept
// outside the gateway-proxied /api/* prefix because the gateway buffers; a
// direct web→chat stream doesn't.
import { getBearerSession, getSession } from "@/lib/auth";
import { INTERNAL_API_SECRET } from "@/lib/internal-secret";
import { getLocale } from "@/lib/locale";
import { rateLimited } from "./rate-limit";

export const dynamic = "force-dynamic";

const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL ?? "http://localhost:4007";

// The assistant drives a paid Claude tool loop, so the endpoint must not be
// open to anonymous or unbounded traffic. Cap the request body; the per-user
// rate limit lives in ./rate-limit.
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  // Require a valid session — the assistant is not a public endpoint. The
  // mobile app has no cookie jar, so a Bearer access token (#801) is accepted
  // when there is no cookie session; chat can't go through the gateway's
  // Bearer path because the gateway buffers and this route must stream SSE.
  const session =
    (await getSession()) ??
    (await getBearerSession(request.headers.get("authorization")));
  if (!session) {
    return Response.json(
      { error: "Please sign in to use the assistant" },
      { status: 401 }
    );
  }
  if (rateLimited(session.userId)) {
    return Response.json(
      { error: "Too many requests — please slow down and try again shortly" },
      { status: 429 }
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Message too large" }, { status: 413 });
  }

  // Reply in the UI's locale, matching the rest of the app: the /si URL prefix
  // wins, then the `lang` cookie (src/lib/locale.ts). The client requests the
  // /si-prefixed variant of this route on Sinhala URLs, so the proxy-owned
  // x-locale header carries the URL locale through to getLocale() — a visitor
  // on a shared /si link no longer gets English replies under a Sinhala UI.
  const locale = await getLocale();
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Message too large" }, { status: 413 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${CHAT_SERVICE_URL}/internal/chat/marketplace/stream`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": INTERNAL_API_SECRET,
          "x-locale": locale,
        },
        body,
        cache: "no-store",
      }
    );
  } catch {
    return Response.json({ error: "assistant unavailable" }, { status: 503 });
  }

  // Non-stream error responses (503/400/404/…) pass straight through.
  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
