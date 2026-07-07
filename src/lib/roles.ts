// Admin role tiers (#226). Admin access used to be a single flat `ADMIN`
// role with no distinction between low-risk actions (resolving a report)
// and high-risk ones (deleting content, editing categories, changing
// roles). This introduces two tiers on top of the legacy role:
//
// - `SUPPORT`    — read access to every /admin page, plus resolving or
//                  dismissing abuse reports. Nothing destructive.
// - `SUPERADMIN` — full access: deletes, category edits, role changes,
//                  user management, and everything SUPPORT can do.
//
// `ADMIN` is kept as-is and treated as SUPERADMIN-equivalent so existing
// admin accounts (there is no migration path to re-tag them) don't lose
// access.
export const ADMIN_ROLES = ["ADMIN", "SUPERADMIN", "SUPPORT"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

// Coarse gate: is this session allowed into /admin at all? Used by the
// shared layout (src/app/admin/layout.tsx) — everything past this point is
// read access at minimum.
export function isAdminRole(
  role: string | null | undefined
): role is AdminRole {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

// Full access — delete actions, category edits, role changes, user
// management. ADMIN is a full-access legacy alias for backward
// compatibility.
export function hasSuperAdminAccess(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

// Read access plus resolving/dismissing abuse reports. Superadmins
// implicitly have everything SUPPORT has.
export function hasSupportAccess(role: string | null | undefined): boolean {
  return hasSuperAdminAccess(role) || role === "SUPPORT";
}
