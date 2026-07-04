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
// propagate — a dead gateway is a 500 on uncached pages, matching the old
// behavior when the database was down (cached entries keep serving stale
// data through a brief outage, which is strictly better).
//
// Caching (#57): by default a call forwards the user's cookies and is
// `no-store`, so nothing gets cached accidentally. Passing `revalidate`
// opts the call into Next's Data Cache: the request is then sent WITHOUT
// cookies — a shared cache entry must never be built from (or vary by) an
// authenticated request — and is re-fetched once the entry is older than
// `revalidate` seconds. Only use it for endpoints whose response is
// identical for every caller.
export async function apiJson<T>(
  path: string,
  opts?: { revalidate?: number }
): Promise<T | null> {
  const res =
    opts?.revalidate !== undefined
      ? // No `cache` option here: `no-store` conflicts with `revalidate` and
        // Next would ignore both (see fetch() API reference).
        await fetch(`${GATEWAY_URL}${path}`, {
          next: { revalidate: opts.revalidate },
        })
      : await apiFetch(path);
  if (!res.ok) return null;
  return (await res.json()) as T;
}
