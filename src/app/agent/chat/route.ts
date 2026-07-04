// Thin streaming proxy to chat-service (#11). The assistant itself — the
// ANTHROPIC_API_KEY, the Claude tool loop, the personas — lives in
// chat-service (internal, behind the internal secret). This route forwards
// the browser's message body plus the end-user's cookie, real IP and locale,
// and pipes the SSE stream straight back. Kept outside the gateway-proxied
// /api/* prefix because the gateway buffers; a direct web→chat stream doesn't.
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";

const CHAT_SERVICE_URL =
  process.env.CHAT_SERVICE_URL ?? "http://localhost:4007";
const INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

export async function POST(request: Request) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = cookieStore.get("lang")?.value === "si" ? "si" : "en";
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const clientIp =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(
      `${CHAT_SERVICE_URL}/internal/chat/marketplace/stream`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": INTERNAL_API_SECRET,
          "x-forwarded-cookie": cookie,
          "x-client-ip": clientIp,
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
