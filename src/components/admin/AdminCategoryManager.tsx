"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaPlus } from "@/components/icons";
import { Field, FormRow } from "@/components/ui/Field";
import { hasFullAdminAccess } from "@/lib/roles";
import { useT } from "../I18nProvider";
import { useToast } from "../ToastProvider";

export type AdminCategory = {
  slug: string;
  labelEn: string;
  labelSi: string;
  icon: string | null;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
};

type EditState = {
  labelEn: string;
  labelSi: string;
  icon: string;
  imageUrl: string;
  sortOrder: string;
};

// Category management (#135/#60): list with an active toggle, inline label
// editing, and an add form. There is deliberately no delete — deactivating
// hides a category from public lists while existing providers keep the slug.
//
// Category edits are explicitly an ADMIN-only action (#226) — SUPPORT
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
  const canManage = hasFullAdminAccess(role);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({
    labelEn: "",
    labelSi: "",
    icon: "",
    imageUrl: "",
    sortOrder: "0",
  });
  const [error, setError] = useState("");
  const [addForm, setAddForm] = useState({
    slug: "",
    labelEn: "",
    labelSi: "",
    icon: "",
    imageUrl: "",
    sortOrder: "",
  });

  // Upload a cover to the "category" media namespace (R2 in prod) and return its
  // relative URL, or null on failure (error surfaced via toast).
  async function uploadImage(file: File): Promise<string | null> {
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/categories/image", {
        method: "POST",
        body,
      });
      if (res.ok) return (await res.json()).url as string;
      const d = await res.json().catch(() => ({}));
      const message = d?.error ?? t.admin.catError;
      setError(message);
      toast.error(message);
      return null;
    } catch {
      setError(t.admin.catError);
      toast.error(t.admin.catError);
      return null;
    } finally {
      setUploading(false);
    }
  }

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
      imageUrl: c.imageUrl ?? "",
      sortOrder: String(c.sortOrder),
    });
  }

  async function saveEdit(slug: string) {
    await patch(slug, {
      labelEn: edit.labelEn.trim(),
      labelSi: edit.labelSi.trim(),
      icon: edit.icon.trim() || null,
      imageUrl: edit.imageUrl || null,
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
        imageUrl: addForm.imageUrl || undefined,
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
        imageUrl: "",
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
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {initial.length === 0 ? (
        <p className="text-ink-500">{t.admin.catEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {initial.map((c) => (
            <li
              key={c.slug}
              className="tech-corners card flex flex-wrap items-center justify-between gap-4 p-4"
            >
              {editing === c.slug ? (
                <div className="flex flex-1 flex-wrap items-end gap-3">
                  <Field label={t.admin.catLabelEn} htmlFor="cat-catLabelEn">
                    <input
                      id="cat-catLabelEn"
                      className="input"
                      value={edit.labelEn}
                      onChange={(e) =>
                        setEdit((f) => ({ ...f, labelEn: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label={t.admin.catLabelSi} htmlFor="cat-catLabelSi">
                    <input
                      id="cat-catLabelSi"
                      className="input"
                      value={edit.labelSi}
                      onChange={(e) =>
                        setEdit((f) => ({ ...f, labelSi: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label={t.admin.catIcon} htmlFor="cat-catIcon">
                    <input
                      id="cat-catIcon"
                      className="input w-36"
                      value={edit.icon}
                      onChange={(e) =>
                        setEdit((f) => ({ ...f, icon: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label={t.admin.catSortOrder} htmlFor="cat-catSortOrder">
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
                  </Field>
                  <Field label={t.admin.catCover} htmlFor="cat-cover-edit">
                    <div className="flex items-center gap-3">
                      {edit.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={edit.imageUrl}
                          alt=""
                          className="h-11 w-16 rounded border border-ink-300 object-cover"
                        />
                      )}
                      <input
                        id="cat-cover-edit"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="text-sm"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadImage(file);
                          if (url) setEdit((f) => ({ ...f, imageUrl: url }));
                        }}
                      />
                    </div>
                  </Field>
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
                  <div className="flex items-center gap-3">
                    {c.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.imageUrl}
                        alt=""
                        className="h-12 w-16 shrink-0 rounded border border-ink-300 object-cover"
                      />
                    )}
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
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-xs text-ink-500">
                      <span className="text-ink-600">{c.slug}</span>
                      <span className="text-ink-300">·</span>
                      <span className="text-ink-400 uppercase tracking-[0.08em]">
                        {t.admin.catSortOrder}
                      </span>
                      <span className="tabular-nums text-ink-600">
                        {c.sortOrder}
                      </span>
                      {c.icon ? (
                        <>
                          <span className="text-ink-300">·</span>
                          <span className="text-ink-600">{c.icon}</span>
                        </>
                      ) : null}
                    </p>
                    </div>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => startEdit(c)}
                        disabled={pending}
                        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-ink-300 bg-surface px-3 py-1.5 font-display text-xs font-semibold text-ink-800 transition-[border-color,color,transform] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.admin.catEdit}
                      </button>
                      <button
                        onClick={() => patch(c.slug, { active: !c.active })}
                        disabled={pending}
                        className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border bg-surface px-3 py-1.5 font-display text-xs font-semibold transition-[border-color,background-color,transform] duration-200 ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${
                          c.active
                            ? "border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 focus-visible:ring-red-300"
                            : "border-emerald-300 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 focus-visible:ring-emerald-300"
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
      <form onSubmit={add} className="tech-corners card mt-8 space-y-4 p-6">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            NEW
          </span>
          <h2 className="text-ink-500">{t.admin.catAddTitle}</h2>
        </div>
        <FormRow>
          <Field label={t.admin.catSlug} htmlFor="cat-catSlug" help={t.admin.catSlugHint}>
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
          </Field>
          <Field label={t.admin.catIcon} htmlFor="cat-catIcon-1">
            <input
              id="cat-catIcon-1"
              className="input"
              value={addForm.icon}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, icon: e.target.value }))
              }
              placeholder="FaWrench"
            />
          </Field>
          <Field label={t.admin.catLabelEn} htmlFor="cat-catLabelEn-1">
            <input
              id="cat-catLabelEn-1"
              className="input"
              value={addForm.labelEn}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, labelEn: e.target.value }))
              }
              required
            />
          </Field>
          <Field label={t.admin.catLabelSi} htmlFor="cat-catLabelSi-1">
            <input
              id="cat-catLabelSi-1"
              className="input"
              value={addForm.labelSi}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, labelSi: e.target.value }))
              }
              required
            />
          </Field>
          <Field label={t.admin.catSortOrder} htmlFor="cat-catSortOrder-1">
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
          </Field>
        </FormRow>
        <Field label={t.admin.catCover} htmlFor="cat-cover-add" help={t.admin.catCoverHint}>
          <div className="flex items-center gap-3">
            {addForm.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={addForm.imageUrl}
                alt=""
                className="h-14 w-20 rounded border border-ink-300 object-cover"
              />
            )}
            <input
              id="cat-cover-add"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const url = await uploadImage(file);
                if (url) setAddForm((f) => ({ ...f, imageUrl: url }));
              }}
            />
            {uploading && (
              <span className="text-xs text-ink-500">{t.admin.catCoverUploading}</span>
            )}
          </div>
        </Field>
        <button type="submit" disabled={pending || uploading} className="btn-primary">
          <FaPlus className="h-3.5 w-3.5" />
          {pending ? t.admin.catAdding : t.admin.catAdd}
        </button>
      </form>
      )}
    </div>
  );
}
