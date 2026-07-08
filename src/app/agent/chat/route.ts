// Thin streaming proxy to chat-service (#11). The assistant itself — the
// ANTHROPIC_API_KEY, the Claude tool loop, the personas — lives in
// chat-service (internal, behind the internal secret). This route forwards
// the browser's message body plus the locale, and pipes the SSE stream
// straight back. The assistant never acts on the user's behalf (it only
// searches the public directory and proposes drafts the user confirms in the
// app), so no session cookie is forwarded into the LLM-driven service. Kept
// outside the gateway-proxied /api/* prefix because the gateway buffers; a
// direct web→chat stream doesn't.
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL ?? "http://localhost:4007";
const INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

// The assistant drives a paid Claude tool loop, so the endpoint must not be
// open to anonymous or unbounded traffic. Cap the request body and rate-limit
// per user.
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = 15; // requests per window
const RATE_WINDOW_MS = 60_000;

// Per-user sliding window. In-memory is fine for the single web instance we run
// at v0.1; if the web tier is ever scaled out, move this behind the gateway's
// Redis limiter.
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

export async function POST(request: Request) {
  // Require a valid session — the assistant is not a public endpoint.
  const session = await getSession();
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

  const cookieStore = await cookies();
  const locale = cookieStore.get("lang")?.value === "si" ? "si" : "en";
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
