"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasSuperAdminAccess } from "@/lib/roles";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

export type AdminCategory = {
  slug: string;
  labelEn: string;
  labelSi: string;
  icon: string | null;
  active: boolean;
  sortOrder: number;
};

type EditState = {
  labelEn: string;
  labelSi: string;
  icon: string;
  sortOrder: string;
};

// Category management (#135/#60): list with an active toggle, inline label
// editing, and an add form. There is deliberately no delete — deactivating
// hides a category from public lists while existing providers keep the slug.
//
// Category edits are explicitly a SUPERADMIN-only action (#226) — SUPPORT
// gets read access here (the list itself) plus report resolve/dismiss
// elsewhere, nothing that mutates the marketplace's category set.
export default function AdminCategoryManager({
  initial,
  role,
}: {
  initial: AdminCategory[];
  role: string;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const canManage = hasSuperAdminAccess(role);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({
    labelEn: "",
    labelSi: "",
    icon: "",
    sortOrder: "0",
  });
  const [error, setError] = useState("");
  const [addForm, setAddForm] = useState({
    slug: "",
    labelEn: "",
    labelSi: "",
    icon: "",
    sortOrder: "",
  });

  async function patch(slug: string, body: Record<string, unknown>) {
    if (!canManage) return false;
    setPending(true);
    setError("");
    const res = await fetch(`/api/admin/categories/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) {
      setEditing(null);
      toast.success(t.toast.adminCategorySaved);
      router.refresh();
      return true;
    }
    const d = await res?.json().catch(() => ({}));
    const message = d?.error ?? t.admin.catError;
    setError(message);
    toast.error(message);
    return false;
  }

  function startEdit(c: AdminCategory) {
    setError("");
    setEditing(c.slug);
    setEdit({
      labelEn: c.labelEn,
      labelSi: c.labelSi,
      icon: c.icon ?? "",
      sortOrder: String(c.sortOrder),
    });
  }

  async function saveEdit(slug: string) {
    await patch(slug, {
      labelEn: edit.labelEn.trim(),
      labelSi: edit.labelSi.trim(),
      icon: edit.icon.trim() || null,
      sortOrder: Number(edit.sortOrder) || 0,
    });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setPending(true);
    setError("");
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: addForm.slug.trim(),
        labelEn: addForm.labelEn.trim(),
        labelSi: addForm.labelSi.trim(),
        icon: addForm.icon.trim() || undefined,
        sortOrder: addForm.sortOrder ? Number(addForm.sortOrder) : undefined,
      }),
    }).catch(() => null);
    setPending(false);
    if (res && res.ok) {
      setAddForm({
        slug: "",
        labelEn: "",
        labelSi: "",
        icon: "",
        sortOrder: "",
      });
      toast.success(t.toast.adminCategoryAdded);
      router.refresh();
    } else {
      const d = await res?.json().catch(() => ({}));
      const message = d?.error ?? t.admin.catError;
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {initial.length === 0 ? (
        <p className="mt-8 text-ink-500">{t.admin.catEmpty}</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {initial.map((c) => (
            <li
              key={c.slug}
              className="card flex flex-wrap items-center justify-between gap-4 p-4"
            >
              {editing === c.slug ? (
                <div className="flex flex-1 flex-wrap items-end gap-3">
                  <div>
                    <label className="label" htmlFor="cat-catLabelEn">
                      {t.admin.catLabelEn}
                    </label>
                    <input
                      id="cat-catLabelEn"
                      className="input"
                      value={edit.labelEn}
                      onChange={(e) =>
                        setEdit((f) => ({ ...f, labelEn: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="cat-catLabelSi">
                      {t.admin.catLabelSi}
                    </label>
                    <input
                      id="cat-catLabelSi"
                      className="input"
                      value={edit.labelSi}
                      onChange={(e) =>
                        setEdit((f) => ({ ...f, labelSi: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="cat-catIcon">
                      {t.admin.catIcon}
                    </label>
                    <input
                      id="cat-catIcon"
                      className="input w-36"
                      value={edit.icon}
                      onChange={(e) =>
                        setEdit((f) => ({ ...f, icon: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="cat-catSortOrder">
                      {t.admin.catSortOrder}
                    </label>
                    <input
                      id="cat-catSortOrder"
                      className="input w-24"
                      type="number"
                      min={0}
                      value={edit.sortOrder}
                      onChange={(e) =>
                        setEdit((f) => ({ ...f, sortOrder: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(c.slug)}
                      disabled={pending}
                      className="btn-primary"
                    >
                      {t.admin.catSave}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(null);
                        setError("");
                      }}
                      disabled={pending}
                      className="btn-ghost"
                    >
                      {t.admin.catCancel}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">
                        {c.labelEn}
                      </span>
                      <span className="text-ink-500">{c.labelSi}</span>
                      {c.active ? (
                        <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                          {t.admin.catActive}
                        </span>
                      ) : (
                        <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                          {t.admin.catInactive}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-500">
                      {c.slug} · {t.admin.catSortOrder.toLowerCase()} {c.sortOrder}
                      {c.icon ? ` · ${c.icon}` : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => startEdit(c)}
                        disabled={pending}
                        className="cursor-pointer rounded-full border border-ink-300 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-800 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
                      >
                        {t.admin.catEdit}
                      </button>
                      <button
                        onClick={() => patch(c.slug, { active: !c.active })}
                        disabled={pending}
                        className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                          c.active
                            ? "border-red-300 bg-surface text-red-600 hover:bg-red-50"
                            : "border-emerald-300 bg-surface text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {c.active ? t.admin.catDeactivate : t.admin.catActivate}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs italic text-ink-400">
                      {t.admin.insufficientPermissions}
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!canManage && (
        <p className="card mt-8 p-6 text-sm text-ink-500">
          {t.admin.insufficientPermissions}
        </p>
      )}

      {canManage && (
      <form onSubmit={add} className="card mt-8 space-y-4 p-6">
        <h2 className="font-semibold text-ink-900">{t.admin.catAddTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cat-catSlug">
              {t.admin.catSlug}
            </label>
            <input
              id="cat-catSlug"
              className="input"
              value={addForm.slug}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, slug: e.target.value }))
              }
              placeholder="solar-installer"
              pattern="[a-z0-9-]{2,40}"
              required
            />
            <p className="mt-1 text-xs text-ink-500">{t.admin.catSlugHint}</p>
          </div>
          <div>
            <label className="label" htmlFor="cat-catIcon-1">
              {t.admin.catIcon}
            </label>
            <input
              id="cat-catIcon-1"
              className="input"
              value={addForm.icon}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, icon: e.target.value }))
              }
              placeholder="FaWrench"
            />
          </div>
          <div>
            <label className="label" htmlFor="cat-catLabelEn-1">
              {t.admin.catLabelEn}
            </label>
            <input
              id="cat-catLabelEn-1"
              className="input"
              value={addForm.labelEn}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, labelEn: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="cat-catLabelSi-1">
              {t.admin.catLabelSi}
            </label>
            <input
              id="cat-catLabelSi-1"
              className="input"
              value={addForm.labelSi}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, labelSi: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="cat-catSortOrder-1">
              {t.admin.catSortOrder}
            </label>
            <input
              id="cat-catSortOrder-1"
              className="input w-32"
              type="number"
              min={0}
              value={addForm.sortOrder}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, sortOrder: e.target.value }))
              }
            />
          </div>
        </div>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? t.admin.catAdding : t.admin.catAdd}
        </button>
      </form>
      )}
    </div>
  );
}
