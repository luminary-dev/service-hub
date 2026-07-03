import { cookies } from "next/headers";

// Server-side gateway client. Server components talk to the API gateway
// directly (client components use relative /api/* URLs, rewritten in
// next.config.ts). The incoming request's cookies are forwarded so the
// gateway can authenticate the user.
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";

export async function apiFetch(path: string, init?: RequestInit) {
  const cookieStore = await cookies();
  return fetch(`${GATEWAY_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      cookie: cookieStore.toString(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

// GET a JSON payload from the gateway; null on any non-2xx response
// (pages map that to notFound()/redirect/empty states). Network errors
// propagate — pages are force-dynamic, so a dead gateway is a 500, matching
// the old behavior when the database was down.
export async function apiJson<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (!res.ok) return null;
  return (await res.json()) as T;
}
