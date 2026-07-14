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
  // #634: under an admin impersonation session the gateway stamps
  // x-impersonated-by with the REAL admin's id while x-user-id (hence adminId
  // above) is the impersonated target. Capture the real admin so an audited
  // action taken while impersonating isn't misattributed to the target.
  const impersonatedBy = c.req.header("x-impersonated-by") || null;
  try {
    await db.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        reason: reason || null,
        impersonatedBy,
      },
    });
  } catch {
    // Best-effort — see note above.
  }
}
