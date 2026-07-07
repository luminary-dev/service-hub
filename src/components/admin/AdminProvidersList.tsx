"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "../I18nProvider";
import { categoryLabelLoc } from "@/lib/i18n";
import { qualityChipClasses } from "@/lib/quality";
import { hasSuperAdminAccess } from "@/lib/roles";
import Avatar from "../Avatar";
import AdminProviderActions from "./AdminProviderActions";

// Admin listing as served by `GET /api/admin/providers` on the gateway
// (newest first, with contact details and review/photo counts hydrated).
export type AdminProviderRow = {
  id: string;
  category: string;
  city: string;
  avatarUrl: string | null;
  verificationStatus: string;
  suspended: boolean;
  user: { name: string; email: string };
  _count: { reviews: number; photos: number };
  quality: {
    qualityScore: number;
    rating: number;
    reviewCount: number;
    openReportCount: number;
  };
};

// Providers list (#231): multi-select + bulk suspend/unsuspend on top of the
// existing per-row AdminProviderActions. `PATCH /api/admin/providers` (no
// :id) is the batch sibling of the single-provider endpoint.
export default function AdminProvidersList({
  providers,
  role,
}: {
  providers: AdminProviderRow[];
  role: string;
}) {
  const t = useT().admin;
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  // Suspend/unsuspend is SUPERADMIN-only (#226), same gate as the per-row
  // AdminProviderActions — SUPPORT admins don't get the multi-select toolbar.
  const canAct = hasSuperAdminAccess(role);
  const allSelected = providers.length > 0 && selected.size === providers.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(providers.map((p) => p.id)));
  }

  async function bulkAct(suspended: boolean) {
    if (selected.size === 0) return;
    setPending(true);
    setError(false);
    const res = await fetch("/api/admin/providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], suspended }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) {
      setSelected(new Set());
      router.refresh();
    } else {
      setError(true);
    }
  }

  if (providers.length === 0) {
    return (
      <div className="card mt-8 px-6 py-16 text-center text-sm text-ink-500">
        {t.providersEmpty}
      </div>
    );
  }

  return (
    <div>
      {canAct && selected.size > 0 && (
        <div className="card sticky top-2 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 p-3">
          <span className="text-sm font-medium text-ink-700">
            {t.selectedCount(selected.size)}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => bulkAct(true)}
              disabled={pending}
              className="cursor-pointer rounded-full border border-red-300 bg-surface px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              {t.bulkSuspend}
            </button>
            <button
              onClick={() => bulkAct(false)}
              disabled={pending}
              className="cursor-pointer rounded-full border border-emerald-300 bg-surface px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              {t.bulkUnsuspend}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={pending}
              className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-400 disabled:opacity-60"
            >
              {t.clearSelection}
            </button>
          </div>
        </div>
      )}
      {canAct && error && (
        <p className="mt-3 text-sm text-red-600">{t.bulkActionError}</p>
      )}

      {canAct && (
        <label className="mt-6 flex items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="size-4 rounded border-ink-300"
          />
          {t.selectAll}
        </label>
      )}

      <ul className="mt-3 space-y-3">
        {providers.map((p) => (
          <li
            key={p.id}
            className="card flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="flex items-center gap-3">
              {canAct && (
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="size-4 shrink-0 rounded border-ink-300"
                  aria-label={t.selectedCount(1)}
                />
              )}
              <Avatar name={p.user.name} url={p.avatarUrl} size={40} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/providers/${p.id}`}
                    className="font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {p.user.name}
                  </Link>
                  {p.verificationStatus === "VERIFIED" && (
                    <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                      {t.verifiedTag}
                    </span>
                  )}
                  {p.verificationStatus === "PENDING" && (
                    <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                      {t.pendingTag}
                    </span>
                  )}
                  {p.suspended && (
                    <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                      {t.suspendedTag}
                    </span>
                  )}
                  <span
                    className={`chip ${qualityChipClasses(p.quality.qualityScore)}`}
                    title={t.qualityScoreBreakdown(
                      p.quality.rating,
                      p.quality.reviewCount,
                      p.quality.openReportCount
                    )}
                  >
                    {t.qualityScoreLabel} {p.quality.qualityScore}
                  </span>
                </div>
                <p className="text-sm text-ink-500">
                  {categoryLabelLoc(p.category, locale)} · {p.city} ·{" "}
                  {p._count.reviews} {t.reviewsHeading.toLowerCase()},{" "}
                  {p._count.photos} {t.photosHeading.toLowerCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/admin/providers/${p.id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                {t.moderate}
              </Link>
              <AdminProviderActions
                providerId={p.id}
                verified={p.verificationStatus === "VERIFIED"}
                suspended={p.suspended}
                role={role}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
