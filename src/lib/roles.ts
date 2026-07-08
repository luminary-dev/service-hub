// Admin role tiers (#226). Admin access used to be a single flat `ADMIN`
// role with no distinction between low-risk actions (resolving a report)
// and high-risk ones (deleting content, editing categories, changing
// roles). There are now two admin tiers:
//
// - `ADMIN`   — full access: deletes, category edits, role changes, user
//               management, and everything SUPPORT can do.
// - `SUPPORT` — read access to every /admin page, plus resolving or
//               dismissing abuse reports. Nothing destructive.
export const ADMIN_ROLES = ["ADMIN", "SUPPORT"] as const;

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
// management. Only `ADMIN` qualifies.
export function hasFullAdminAccess(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

// Read access plus resolving/dismissing abuse reports. Admins implicitly
// have everything SUPPORT has.
export function hasSupportAccess(role: string | null | undefined): boolean {
  return hasFullAdminAccess(role) || role === "SUPPORT";
}
