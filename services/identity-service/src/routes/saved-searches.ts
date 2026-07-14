// Saved searches (#516): named snapshots of the /providers browse filters
// (free-text query + category + district), customer-only. New-match alerting
// runs in provider-service against the internal candidate feed (see
// routes/internal-saved-searches.ts).
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db } from "../db";
import { categoryValidator } from "../lib/categories";
import { DISTRICTS } from "../lib/constants";
import { getAuth, getLocale } from "../lib/http";
import { advisoryXactLock } from "../lib/locks";

export const savedSearchesRoutes = new Hono();

// Per-user cap: bounds both the account list and the alert fan-out a single
// user can subscribe to.
export const MAX_SAVED_SEARCHES = 20;

const publicSelect = {
  id: true,
  name: true,
  query: true,
  category: true,
  district: true,
  createdAt: true,
} as const;

// Empty strings mean "filter not set" (the web form serializes absent filters
// that way) and normalize to null.
const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  query: z.string().trim().max(100).optional().or(z.literal("")),
  category: z.string().max(60).optional().or(z.literal("")),
  district: z.string().max(60).optional().or(z.literal("")),
});

// The whole surface is customer-only (the issue scopes saved searches to
// customers with a recurring need); admins/providers get a 403, not an
// empty list, so the web gate and this one visibly agree.
function requireCustomer(c: Context) {
  const auth = getAuth(c);
  if (!auth) return { auth: null, res: c.json({ error: "Unauthorized" }, 401) };
  if (auth.role !== "CUSTOMER") {
    return { auth: null, res: c.json({ error: "Forbidden" }, 403) };
  }
  return { auth, res: null };
}

// GET /api/saved-searches — the caller's saved searches, newest first.
savedSearchesRoutes.get("/", async (c) => {
  const { auth, res } = requireCustomer(c);
  if (!auth) return res;

  const savedSearches = await db.savedSearch.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: publicSelect,
  });
  return c.json({ savedSearches });
});

// POST /api/saved-searches
savedSearchesRoutes.post("/", async (c) => {
  const { auth, res } = requireCustomer(c);
  if (!auth) return res;

  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const name = parsed.data.name;
  const query = parsed.data.query?.trim() || null;
  const category = parsed.data.category || null;
  const district = parsed.data.district || null;

  // A search with no filters would match every new provider — refuse it.
  if (!query && !category && !district) {
    return c.json({ error: "At least one filter is required" }, 400);
  }
  if (category && !(await categoryValidator.isValidCategory(category))) {
    return c.json({ error: "Invalid category" }, 400);
  }
  if (district && !(DISTRICTS as readonly string[]).includes(district)) {
    return c.json({ error: "Invalid district" }, 400);
  }

  // The dup check + per-user cap + insert run inside one transaction guarded by
  // a per-user advisory lock, so a concurrent double-submit can't race the
  // check-then-act: two simultaneous saves can't both read count < cap and
  // overshoot MAX_SAVED_SEARCHES, nor both insert the same filters (a plain
  // transaction wouldn't serialize them — see lib/locks). Saving the same
  // filters twice is still a no-op returning the existing row, so a
  // double-click / re-save never burns a slot.
  const result = await db.$transaction(async (tx) => {
    await advisoryXactLock(tx, "saved-search", auth.userId);

    const existing = await tx.savedSearch.findFirst({
      where: { userId: auth.userId, query, category, district },
      select: publicSelect,
    });
    if (existing) return { kind: "existing" as const, savedSearch: existing };

    const count = await tx.savedSearch.count({ where: { userId: auth.userId } });
    if (count >= MAX_SAVED_SEARCHES) return { kind: "capped" as const };

    const savedSearch = await tx.savedSearch.create({
      data: {
        userId: auth.userId,
        name,
        query,
        category,
        district,
        locale: getLocale(c),
      },
      select: publicSelect,
    });
    return { kind: "created" as const, savedSearch };
  });

  if (result.kind === "capped") {
    return c.json({ error: "Saved search limit reached" }, 429);
  }
  if (result.kind === "existing") {
    return c.json({ savedSearch: result.savedSearch });
  }
  return c.json({ savedSearch: result.savedSearch }, 201);
});

// DELETE /api/saved-searches/:id — idempotent, own rows only.
savedSearchesRoutes.delete("/:id", async (c) => {
  const { auth, res } = requireCustomer(c);
  if (!auth) return res;

  await db.savedSearch.deleteMany({
    where: { id: c.req.param("id"), userId: auth.userId },
  });
  return c.json({ deleted: true });
});
