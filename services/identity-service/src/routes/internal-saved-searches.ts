// Internal saved-search endpoints (#516) consumed by provider-service's
// new-match alert fan-out (secret already enforced by the global middleware).
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";

export const internalSavedSearchesRoutes = new Hono();

// Bound on candidates handed to one fan-out — well above any realistic v0.1
// subscriber set for a single category/district; if ever hit, the oldest
// searches win (first-subscribed, first-alerted).
const MAX_CANDIDATES = 500;

// One alert per saved search per day: a burst of matching registrations must
// not turn a saved search into a mail firehose.
export const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Bound on the districts= list: providers serve at most 5 districts today
// (#502); 25 (the full Sri Lankan district list) caps a drifted caller.
const MAX_DISTRICTS = 25;

// GET /internal/saved-searches/candidates?category=&districts=a,b&excludeUserId= —
// the saved searches a newly published provider could match, joined with the
// owner's email. `districts` is the provider's full served set (#502
// multi-district: primary + serviceDistricts), so a search for ANY served
// district qualifies — not just where the provider is based. A null
// category/district on a search means "any", so it stays a candidate for
// every value. Only current CUSTOMER accounts with a verified email are
// alerted: a role change ends the subscription, and an unverified (possibly
// not-owned) address must never receive marketing-adjacent mail. Free-text
// `query` is returned unevaluated — provider-service owns the browse
// where-clause and decides the actual match.
internalSavedSearchesRoutes.get("/candidates", async (c) => {
  const category = c.req.query("category");
  const districts = [
    ...new Set(
      (c.req.query("districts") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_DISTRICTS);
  if (!category || districts.length === 0) {
    return c.json({ error: "category and districts are required" }, 400);
  }
  const excludeUserId = c.req.query("excludeUserId");
  const cutoff = new Date(Date.now() - NOTIFY_COOLDOWN_MS);

  const rows = await db.savedSearch.findMany({
    where: {
      OR: [{ category: null }, { category }],
      AND: [
        { OR: [{ district: null }, { district: { in: districts } }] },
        { OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: cutoff } }] },
      ],
      ...(excludeUserId ? { NOT: { userId: excludeUserId } } : {}),
      user: { role: "CUSTOMER", emailVerified: { not: null } },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_CANDIDATES,
    select: {
      id: true,
      userId: true,
      query: true,
      locale: true,
      user: { select: { email: true } },
    },
  });

  // `userId` addresses the in-app half of the alert (notification events are
  // keyed by recipient userId); `email` remains the delivery address.
  return c.json({
    savedSearches: rows.map((s) => ({
      id: s.id,
      userId: s.userId,
      query: s.query,
      locale: s.locale,
      email: s.user.email,
    })),
  });
});

// POST /internal/saved-searches/notified { ids } — cooldown bookkeeping after
// a fan-out actually emailed the owners of these searches.
const notifiedSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_CANDIDATES),
});

internalSavedSearchesRoutes.post("/notified", async (c) => {
  const parsed = notifiedSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  await db.savedSearch.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: { lastNotifiedAt: new Date() },
  });
  return c.json({ ok: true });
});
