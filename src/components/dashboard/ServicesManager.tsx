"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRICE_TYPES } from "@/lib/constants";
import { formatLKR } from "@/lib/format";
import { priceTypeLabelLoc } from "@/lib/i18n";
import { useLocale, useT } from "../I18nProvider";
import type { ServiceItem } from "./DashboardTabs";

type Draft = {
  title: string;
  description: string;
  price: string;
  priceType: string;
};

const emptyDraft: Draft = {
  title: "",
  description: "",
  price: "",
  priceType: "FIXED",
};

export default function ServicesManager({
  initial,
}: {
  initial: ServiceItem[];
}) {
  const [services, setServices] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Two-step delete (#562): first tap arms the row, second confirms.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();
  const locale = useLocale();
  const s2 = useT().dashboard.services;

  function startNew() {
    setDraft(emptyDraft);
    setEditing("new");
    setError("");
  }

  function startEdit(s: ServiceItem) {
    setDraft({
      title: s.title,
      description: s.description,
      price: String(s.price),
      priceType: s.priceType,
    });
    setEditing(s.id);
    setError("");
  }

  async function save() {
    if (
      draft.title.trim().length < 2 ||
      !draft.price ||
      Number(draft.price) <= 0
    ) {
      setError(s2.titlePriceRequired);
      return;
    }
    setLoading(true);
    setError("");
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      price: Number(draft.price),
      priceType: draft.priceType,
    };
    try {
      const res =
        editing === "new"
          ? await fetch("/api/provider/services", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/provider/services/${editing}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      if (res.ok) {
        const { service } = await res.json();
        setServices((list) =>
          editing === "new"
            ? [...list, { ...service, description: service.description ?? "" }]
            : list.map((s) =>
                s.id === editing
                  ? { ...service, description: service.description ?? "" }
                  : s,
              ),
        );
        setEditing(null);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? s2.saveError);
      }
    } catch {
      // Network failure — recover instead of wedging the button (#363).
      setError(s2.saveError);
    } finally {
      setLoading(false);
    }
  }

  function askRemove(id: string) {
    if (services.length === 1) {
      setError(s2.keepOne);
      return;
    }
    setError("");
    setConfirmingId(id);
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/provider/services/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setServices((list) => list.filter((s) => s.id !== id));
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? s2.deleteError);
      }
    } catch {
      setError(s2.deleteError);
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white dark:text-ink-50">
            SVC
          </span>
          <h2 className="font-semibold text-ink-900">{s2.heading}</h2>
        </div>
        <button onClick={startNew} className="btn-primary !px-4 !py-2">
          {s2.add}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {editing !== null && (
        <div className="tech-corners mt-4 rounded-sm border border-ink-300 bg-ink-50 p-4">
          <div className="space-y-3">
            <input
              className="input"
              placeholder={s2.titlePh}
              aria-label={s2.titlePh}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <input
              className="input"
              placeholder={s2.descPh}
              aria-label={s2.descPh}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
            <div className="flex gap-3">
              <input
                className="input flex-1"
                type="number"
                min={1}
                placeholder={s2.pricePh}
                aria-label={s2.pricePh}
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              />
              <select
                className="input w-36"
                aria-label={s2.pricePh}
                value={draft.priceType}
                onChange={(e) =>
                  setDraft({ ...draft, priceType: e.target.value })
                }
              >
                {PRICE_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {priceTypeLabelLoc(pt.value, locale)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} disabled={loading} className="btn-primary">
              {loading ? s2.saving : s2.save}
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost">
              {s2.cancel}
            </button>
          </div>
        </div>
      )}

      <ul className="mt-4 divide-y divide-dashed divide-ink-200">
        {services.map((s) => (
          <li
            key={s.id}
            className="flex items-start justify-between gap-4 py-3"
          >
            <div>
              <p className="font-medium text-ink-800">{s.title}</p>
              {s.description && (
                <p className="mt-0.5 text-sm text-ink-500">{s.description}</p>
              )}
              <p className="mt-1 text-sm font-semibold text-brand-700">
                {formatLKR(s.price, locale)}{" "}
                <span className="font-normal text-ink-500">
                  · {priceTypeLabelLoc(s.priceType, locale)}
                </span>
              </p>
            </div>
            {confirmingId === s.id ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <span className="text-sm text-ink-600">{s2.confirmDelete}</span>
                <button
                  onClick={() => remove(s.id)}
                  disabled={deletingId !== null}
                  className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  {deletingId === s.id ? s2.deleting : s2.delete}
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  disabled={deletingId !== null}
                  className="text-sm font-medium text-ink-500 hover:text-ink-800 disabled:opacity-50"
                >
                  {s2.cancel}
                </button>
              </div>
            ) : (
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => startEdit(s)}
                  className="text-sm font-medium text-ink-500 hover:text-ink-800"
                >
                  {s2.edit}
                </button>
                <button
                  onClick={() => askRemove(s.id)}
                  className="text-sm font-medium text-red-500 hover:text-red-600"
                >
                  {s2.delete}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
