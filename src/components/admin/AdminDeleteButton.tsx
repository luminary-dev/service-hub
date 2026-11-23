"use client";

import { useRouter } from "next/navigation";
import { FaTrash } from "@/components/icons";
import { hasFullAdminAccess } from "@/lib/roles";
import TwoStepConfirmButton from "@/components/ui/TwoStepConfirmButton";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

const pillClass =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider transition-[border-color,color,background-color] duration-200 ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60";

export default function AdminDeleteButton({
  endpoint,
  role,
}: {
  endpoint: string;
  role: string;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  // Delete is a destructive, ADMIN-only action (#226) — SUPPORT gets
  // read access plus report resolve/dismiss, nothing destructive.
  const allowed = hasFullAdminAccess(role);

  async function remove() {
    const res = await fetch(endpoint, { method: "DELETE" }).catch(() => null);
    if (res && res.ok) {
      toast.success(t.toast.adminDeleted);
      router.refresh();
      return true;
    }
    toast.error(t.toast.adminDeleteError);
    return false; // stay in the confirm state so a retry is one click away
  }

  return (
    <TwoStepConfirmButton
      triggerLabel={t.admin.delete}
      triggerAriaLabel={allowed ? t.admin.delete : t.admin.insufficientPermissions}
      triggerTitle={allowed ? undefined : t.admin.insufficientPermissions}
      icon={<FaTrash className="h-3 w-3" />}
      confirmLabel={t.admin.confirmDelete}
      cancelLabel={t.admin.cancel}
      onConfirm={remove}
      disabled={!allowed}
      wrapperClassName=""
      buttonRowClassName="flex flex-wrap items-center gap-2"
      triggerClassName={`${pillClass} border-red-200 bg-surface text-red-600 hover:border-red-300 hover:bg-red-50 focus-visible:ring-red-400`}
      confirmClassName={`${pillClass} border-red-600 bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400`}
      cancelClassName={`${pillClass} border-ink-300 bg-surface text-ink-600 hover:bg-ink-100 focus-visible:ring-ink-300`}
    />
  );
}
