// Admin impersonation ("view as", #234) — lets an admin briefly assume a
// target user's session to reproduce/debug an issue from their perspective.
//
// Security posture (see AGENTS.md / issue #234):
//  - ADMIN-only (#226): impersonation is destructive/high-risk, so it is
//    gated with isFullAdmin. The SUPPORT tier (read + report resolve/dismiss)
//    can never impersonate.
//  - Issues a short-lived (15m) token in a distinct `impersonation_session`
//    cookie (see lib/session.ts) — it never touches the admin's own
//    `sh_session` cookie, so ending impersonation is just clearing the extra
//    cookie.
//  - Every start is written to ImpersonationLog (adminId, targetUserId,
//    startedAt). This is a standalone log for this feature; it should be
//    reconciled with the general admin audit log once #227 merges.
import { Hono } from "hono";
import { db } from "../db";
import { getAuth, isFullAdmin } from "../lib/http";
import { log } from "../lib/log";
import {
  createImpersonationSession,
  destroyImpersonationSession,
  readImpersonationSession,
} from "../lib/session";
import { getProviderIdByUser } from "../lib/providers";

export const adminImpersonationRoutes = new Hono();

// ---------------------------------------------------------------------------
// POST /api/admin/impersonate/end
//
// Registered before the "/:userId" route below; Hono's router prefers a
// static path match over a param match regardless of registration order, so
// this always wins for the literal "end" segment — a plain userId can never
// collide with it.
// ---------------------------------------------------------------------------
adminImpersonationRoutes.post("/end", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const active = await readImpersonationSession(c);
  destroyImpersonationSession(c);

  if (active) {
    // Best-effort: close out the most recent open log row for this
    // admin/target pair. Missing a row here must never block ending the
    // impersonation session itself.
    try {
      const openLog = await db.impersonationLog.findFirst({
        where: {
          adminId: active.impersonatedBy,
          targetUserId: active.userId,
          endedAt: null,
        },
        orderBy: { startedAt: "desc" },
      });
      if (openLog) {
        await db.impersonationLog.update({
          where: { id: openLog.id },
          data: { endedAt: new Date() },
        });
      }
    } catch (e) {
      log.error("failed to close impersonation log", {
        context: "impersonate-end",
        err: e,
      });
    }

    log.info("impersonation ended", {
      adminId: active.impersonatedBy,
      targetUserId: active.userId,
    });
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/admin/impersonate/:userId — :userId may be a user id or an email
// (the frontend form accepts either; we try id first, then email).
// ---------------------------------------------------------------------------
adminImpersonationRoutes.post("/:userId", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const raw = c.req.param("userId");
  // Try the id lookup verbatim (ids are case-sensitive cuids), then fall back
  // to email. Stored emails are always lowercased, so normalize the typed
  // value (trim + lowercase) to match — otherwise a mixed-case address like
  // "Foo@Bar.com" would spuriously 404 an existing user.
  let target = await db.user.findUnique({ where: { id: raw } }).catch(() => null);
  if (!target) {
    const email = raw.trim().toLowerCase();
    target = await db.user.findUnique({ where: { email } }).catch(() => null);
  }

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }
  if (target.id === auth.userId) {
    return c.json({ error: "Cannot impersonate your own account" }, 400);
  }
  // Defense in depth beyond the ADMIN-only gate above: never let one admin
  // session ride in as another admin.
  if (target.role === "ADMIN") {
    return c.json({ error: "Cannot impersonate an admin account" }, 400);
  }

  // Record the admin's own sessionVersion in the token (#358) so verifiers can
  // revoke an active impersonation the moment the admin is force-logged-out or
  // resets their password — not just when the 15m token expires.
  const admin = await db.user
    .findUnique({ where: { id: auth.userId }, select: { sessionVersion: true } })
    .catch(() => null);
  if (!admin) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await createImpersonationSession(c, {
    userId: target.id,
    role: target.role,
    name: target.name,
    sv: target.sessionVersion,
    impersonatedBy: auth.userId,
    impersonatedBySv: admin.sessionVersion,
  });

  try {
    await db.impersonationLog.create({
      data: { adminId: auth.userId, targetUserId: target.id },
    });
  } catch (e) {
    // Logging failure must not block a security control that already
    // succeeded from the cookie's perspective — but it's exactly the kind of
    // gap we cannot silently swallow, so it goes to the service log too.
    log.error("failed to write impersonation log", {
      context: "impersonate-start",
      err: e,
    });
  }

  log.info("impersonation started", {
    adminId: auth.userId,
    targetUserId: target.id,
  });

  const providerId = await getProviderIdByUser(target.id);

  return c.json({
    ok: true,
    user: { id: target.id, name: target.name, role: target.role },
    providerId,
    expiresInSeconds: 15 * 60,
  });
});
