"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaTrash } from "@/components/icons";
import { hasSuperAdminAccess } from "@/lib/roles";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

export default function AdminDeleteButton({
  endpoint,
  role,
}: {
  endpoint: string;
  role: string;
}) {
  const [pending, setPending] = useState(false);
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  // Delete is a destructive, SUPERADMIN-only action (#226) — SUPPORT gets
  // read access plus report resolve/dismiss, nothing destructive.
  const allowed = hasSuperAdminAccess(role);

  async function remove() {
    if (!allowed) return;
    setPending(true);
    const res = await fetch(endpoint, { method: "DELETE" }).catch(() => null);
    setPending(false);
    if (res && res.ok) {
      toast.success(t.toast.adminDeleted);
      router.refresh();
    } else {
      toast.error(t.toast.adminDeleteError);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={pending || !allowed}
      aria-label={allowed ? t.admin.delete : t.admin.insufficientPermissions}
      title={allowed ? undefined : t.admin.insufficientPermissions}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-red-200 bg-surface px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-red-600 transition-[border-color,color,background-color] duration-200 ease-snap hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <FaTrash className="h-3 w-3" />
      {t.admin.delete}
    </button>
  );
}
