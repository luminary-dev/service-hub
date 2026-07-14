// Per-user sliding-window limiter for the chat-assistant proxy (#11). The
// assistant drives a paid Claude tool loop, so the endpoint must not be open to
// unbounded traffic. In-memory is fine for the single web instance we run at
// v0.1; if the web tier is ever scaled out, move this behind the gateway's
// Redis limiter.
export const RATE_LIMIT = 15; // requests per window
export const RATE_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();
let lastSweep = 0;

// Drop users whose most recent hit has aged out of the window so the map can't
// grow one permanent entry per distinct user over the process lifetime
// (mirroring the gateway limiter's sweep()). Throttled to at most once per
// window so a burst of requests doesn't rescan the whole map every call.
function sweep(now: number) {
  if (now - lastSweep < RATE_WINDOW_MS) return;
  lastSweep = now;
  for (const [userId, times] of hits) {
    if (times.length === 0 || times[times.length - 1] <= now - RATE_WINDOW_MS) {
      hits.delete(userId);
    }
  }
}

export function rateLimited(userId: string, now = Date.now()): boolean {
  sweep(now);
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

// Test-only: number of users currently tracked in the map.
export function trackedUserCount(): number {
  return hits.size;
}
