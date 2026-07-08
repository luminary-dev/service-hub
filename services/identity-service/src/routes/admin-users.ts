// Admin user-management endpoints (#220): search/list, detail, lock/unlock +
// manual role change, and force-logout. Reads (list/detail) are open to the
// SUPPORT tier; the destructive writes (role change, lock, force-logout)
// require full ADMIN (#226). Roles are forwarded by the gateway.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { getAuth, isFullAdmin, isSupportOrAdmin } from "../lib/http";
import { isLockedOut, MANUAL_LOCK_UNTIL } from "../lib/lockout";
import { fetchProvidersByIds } from "../lib/providers";

export const adminUsersRoutes = new Hono();

const PAGE_SIZE = 20;

type UserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  emailVerified: Date | null;
  sessionVersion: number;
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
};

function serializeUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    emailVerified: u.emailVerified,
    sessionVersion: u.sessionVersion,
    failedLogins: u.failedLogins,
    lockedUntil: u.lockedUntil,
    locked: isLockedOut(u.lockedUntil),
    createdAt: u.createdAt,
  };
}

// GET /api/admin/users?q=&page= — search by email/name (case-insensitive
// contains), newest first, paginated.
adminUsersRoutes.get("/api/admin/users", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const q = (c.req.query("q") ?? "").trim();
  const page = Math.max(1, Number(c.req.query("page")) || 1);

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.user.count({ where }),
  ]);

  return c.json({
    users: rows.map(serializeUser),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
});

// GET /api/admin/users/:id — detail plus favorites (hydrated with provider
// names/phones from provider-service; degrades to null per-favorite on a
// provider-service outage).
adminUsersRoutes.get("/api/admin/users/:id", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  const user = await db.user.findUnique({
    where: { id },
    include: { favorites: { orderBy: { createdAt: "desc" } } },
  });
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const providerById = await fetchProvidersByIds(
    user.favorites.map((f) => f.providerId)
  );
  const favorites = user.favorites.map((f) => ({
    providerId: f.providerId,
    createdAt: f.createdAt,
    provider: providerById.get(f.providerId) ?? null,
  }));

  return c.json({ user: { ...serializeUser(user), favorites } });
});

const patchSchema = z
  .object({
    action: z.enum(["lock", "unlock"]).optional(),
    role: z.enum(["CUSTOMER", "PROVIDER", "ADMIN"]).optional(),
  })
  .refine((d) => d.action !== undefined || d.role !== undefined, {
    message: "action or role is required",
  });

// PATCH /api/admin/users/:id — lock/unlock (reuses the failed-login lockout
// column) and/or a manual role change. Self-service on your own account is
// blocked so an admin can't accidentally lock themselves out or demote away
// the only admin session.
adminUsersRoutes.patch("/api/admin/users/:id", async (c) => {
  const auth = getAuth(c);
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  if (id === auth?.userId) {
    return c.json({ error: "Cannot modify your own account here" }, 400);
  }

  const user = await db.user.findUnique({ where: { id } });
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.action === "lock") {
    data.lockedUntil = MANUAL_LOCK_UNTIL;
  } else if (parsed.data.action === "unlock") {
    data.lockedUntil = null;
    data.failedLogins = 0;
  }
  if (parsed.data.role) {
    data.role = parsed.data.role;
  }

  const updated = await db.user.update({ where: { id }, data });
  return c.json({ user: serializeUser(updated) });
});

// POST /api/admin/users/:id/force-logout — bumps sessionVersion so every
// token minted before this moment fails the gateway's revocation check.
adminUsersRoutes.post("/api/admin/users/:id/force-logout", async (c) => {
  const auth = getAuth(c);
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  if (id === auth?.userId) {
    return c.json({ error: "Cannot force-logout your own account" }, 400);
  }

  const user = await db.user.findUnique({ where: { id } });
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const updated = await db.user.update({
    where: { id },
    data: { sessionVersion: { increment: 1 } },
  });
  return c.json({ ok: true, sessionVersion: updated.sessionVersion });
});
