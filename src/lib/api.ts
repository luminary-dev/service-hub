import { cookies } from "next/headers";

// Server-side gateway client. Server components talk to the API gateway
// directly (client components use relative /api/* URLs, rewritten in
// next.config.ts). The incoming request's cookies are forwarded so the
// gateway can authenticate the user.
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";

// Correlation header (#760): the gateway echoes the request id it assigned on
// every response, so a user-visible SSR failure can be tied back to the exact
// gateway/service log chain. We surface it on ApiError below and in the web
// error pages ("Error ID"). Kept lowercase — fetch header names are
// case-insensitive but the gateway emits it lowercase.
export const REQUEST_ID_HEADER = "x-request-id";

// Thrown by apiJson when the gateway returns an unexpected status (anything
// non-2xx that is NOT a 404/403 — those are legitimate "no data / forbidden"
// answers a page maps to notFound()/empty). Carries the status and the
// gateway's echoed request id so error.tsx / onRequestError can report them.
// A throw is what lets the segment `error.tsx` boundary fire — previously
// every non-2xx collapsed to null, so a backend 5xx rendered as a hard 404 on
// provider profiles and as false-empty states on the jobs/account pages (#747).
export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  constructor(status: number, path: string, requestId: string | null) {
    super(`Gateway responded ${status} for ${path}`);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

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

async function rawFetch(path: string, opts?: { revalidate?: number }) {
  return opts?.revalidate !== undefined
    ? // No `cache` option here: `no-store` conflicts with `revalidate` and
      // Next would ignore both (see fetch() API reference).
      await fetch(`${GATEWAY_URL}${path}`, {
        next: { revalidate: opts.revalidate },
      })
    : await apiFetch(path);
}

// GET a JSON payload from the gateway. Status classes are distinguished (#747):
//   - 2xx           → the parsed payload
//   - 404 / 403     → null (a genuine "not found" / "forbidden"; pages map that
//                     to notFound()/redirect/empty states)
//   - anything else → throws ApiError, so the nearest `error.tsx` boundary
//                     fires instead of the page silently rendering as empty or
//                     404. Network errors also propagate (a dead gateway is a
//                     500 on uncached pages). Cached entries keep serving stale
//                     data through a brief outage, which is strictly better.
//
// For best-effort / optional sub-fetches that must DEGRADE rather than take the
// whole page down, use apiJsonSafe(); for surfaces that want to render an
// explicit "temporarily unavailable" panel inline (keeping their layout), use
// apiResult().
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
  const res = await rawFetch(path, opts);
  if (res.ok) return (await res.json()) as T;
  // A 404/403 is a legitimate answer ("no such resource" / "not yours").
  if (res.status === 404 || res.status === 403) return null;
  throw new ApiError(res.status, path, res.headers.get(REQUEST_ID_HEADER));
}

// Best-effort variant: null on ANY failure (non-2xx or network error). Use for
// optional data whose absence should degrade gracefully rather than error the
// page — e.g. a rating breakdown, a favourited flag, count badges. This is the
// pre-#747 apiJson behavior, kept explicit for the calls that genuinely want it.
export async function apiJsonSafe<T>(
  path: string,
  opts?: { revalidate?: number }
): Promise<T | null> {
  try {
    const res = await rawFetch(path, opts);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Discriminated result: never throws. Lets a page tell "empty" apart from
// "temporarily unavailable" and render an explicit unavailable state inline
// (#747) while keeping its surrounding layout. `status` is null on a network
// error (no response reached us).
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; requestId: string | null };

export async function apiResult<T>(
  path: string,
  opts?: { revalidate?: number }
): Promise<ApiResult<T>> {
  try {
    const res = await rawFetch(path, opts);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        requestId: res.headers.get(REQUEST_ID_HEADER),
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: null, requestId: null };
  }
}
