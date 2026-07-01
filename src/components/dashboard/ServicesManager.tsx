"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRICE_TYPES, formatLKR, priceTypeLabel } from "@/lib/constants";
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
  const router = useRouter();

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
    if (draft.title.trim().length < 2 || !draft.price || Number(draft.price) <= 0) {
      setError("A title and a valid price are required.");
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
    setLoading(false);
    if (res.ok) {
      const { service } = await res.json();
      setServices((list) =>
        editing === "new"
          ? [...list, { ...service, description: service.description ?? "" }]
          : list.map((s) =>
              s.id === editing
                ? { ...service, description: service.description ?? "" }
                : s
            )
      );
      setEditing(null);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Could not save service.");
    }
  }

  async function remove(id: string) {
    if (services.length === 1) {
      setError("Keep at least one service on your profile.");
      return;
    }
    const res = await fetch(`/api/provider/services/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setServices((list) => list.filter((s) => s.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">Your services & rates</h2>
        <button onClick={startNew} className="btn-primary !px-4 !py-2">
          + Add service
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {editing !== null && (
        <div className="mt-4 rounded-xl bg-ink-50 p-4">
          <div className="space-y-3">
            <input
              className="input"
              placeholder="Service title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <input
              className="input"
              placeholder="Short description (optional)"
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
                placeholder="Price (Rs.)"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              />
              <select
                className="input w-36"
                value={draft.priceType}
                onChange={(e) =>
                  setDraft({ ...draft, priceType: e.target.value })
                }
              >
                {PRICE_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} disabled={loading} className="btn-primary">
              {loading ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="mt-4 divide-y divide-ink-100">
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
                {formatLKR(s.price)}{" "}
                <span className="font-normal text-ink-400">
                  · {priceTypeLabel(s.priceType)}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => startEdit(s)}
                className="text-sm font-medium text-ink-500 hover:text-ink-800"
              >
                Edit
              </button>
              <button
                onClick={() => remove(s.id)}
                className="text-sm font-medium text-red-500 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
