// Moderation audit trail (#227): fire-and-record after every admin write in
// this service (report resolve/dismiss, takedown/restore orchestration).
// Rows written here carry service = "trust-safety"; owner-native admin
// actions that stay in provider/review/job land in the same unified table via
// POST /internal/audit (see routes/internal.ts) with their own service tag.
import type { Context } from "hono";
import { db } from "../db";
import { getAuth } from "./http";

export const LOCAL_SERVICE = "trust-safety";

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
      data: {
        adminId,
        action,
        targetType,
        targetId,
        reason: reason || null,
        service: LOCAL_SERVICE,
      },
    });
  } catch {
    // Best-effort — a logging failure must never roll back or block the
    // moderation action itself.
  }
}
