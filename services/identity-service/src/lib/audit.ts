// Audit trail for identity-owned actions (#403). Mirrors review-service /
// provider-service's logAudit so the admin frontend can merge the logs; the
// tables are never joined server-side. Best-effort: a logging failure must
// never roll back or block the action itself.
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
    // Best-effort — see note above.
  }
}
