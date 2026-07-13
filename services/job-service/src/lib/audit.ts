// Moderation audit trail (#376): fire-and-record after every admin write in
// this service (job hide/unhide, report resolve/dismiss). provider-service
// and review-service keep identical AdminAuditLog tables + write paths for
// the moderation actions they own; the logs are merged only in the admin
// frontend's combined view, never server-side.
import type { Context } from "hono";
import { db } from "../db";
import { getAuth } from "./http";

export async function logAudit(
  c: Context,
  action: string,
  targetType: string,
  targetId: string,
  reason?: string | null
): Promise<void> {
  const adminId = getAuth(c)?.userId;
  if (!adminId) return;
  try {
    await db.adminAuditLog.create({
      data: { adminId, action, targetType, targetId, reason: reason || null },
    });
  } catch {
    // Best-effort — a logging failure must never roll back or block the
    // moderation action itself.
  }
}
