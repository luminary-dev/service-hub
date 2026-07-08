import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";

// Centralized session/role gate for the whole /admin section (#226).
// Previously every page under src/app/admin/** repeated the same two
// checks (redirect to /login with no session, to / when not an admin) —
// a new page that forgot the check would silently be unprotected. This
// layout is the single place that now enforces it.
//
// The per-page checks are left in place deliberately: removing them would
// touch every existing admin page for no functional gain (this layout runs
// first regardless) and risks an unrelated regression. New pages don't need
// to repeat the check; this layout is the safety net.
//
// Coarse-grained only: both ADMIN and SUPPORT may enter /admin (read
// access at minimum). Finer-grained gating of specific destructive
// actions (delete, category edits, ...) lives in src/lib/roles.ts
// (hasFullAdminAccess / hasSupportAccess) and is applied per-component.
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

  return <>{children}</>;
}
