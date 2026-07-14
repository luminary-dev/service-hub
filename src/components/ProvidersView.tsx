"use client";

// List/map results toggle for /providers (#48, search RFC phase 3). The
// server-rendered list (passed as children, favorites and all) is the
// default and the primary accessible representation; the map view is
// progressive enhancement mounted only on demand. Plain buttons with
// aria-pressed — a segmented control, not tabs: the two views are alternate
// renderings of one result set, and view state is deliberately not in the
// URL so filter/pagination links behave exactly as before.
import { useState, type ReactNode } from "react";
import { useT } from "@/components/I18nProvider";
import ProviderMapView from "@/components/ProviderMapView";
import type { BrowseFilters } from "@/lib/search-params";

export default function ProvidersView({
  filters,
  children,
}: {
  filters: BrowseFilters;
  children: ReactNode;
}) {
  const [view, setView] = useState<"list" | "map">("list");
  const t = useT().browse;

  const toggleClass = (active: boolean) =>
    `px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
      active
        ? "bg-brand-700 text-white dark:text-ink-50"
        : "bg-surface text-ink-700 hover:text-brand-700"
    }`;

  return (
    <div>
      <div
        role="group"
        aria-label={t.viewLabel}
        className="mt-6 inline-flex overflow-hidden rounded-sm border border-ink-300"
      >
        <button
          type="button"
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
          className={toggleClass(view === "list")}
        >
          {t.viewList}
        </button>
        <button
          type="button"
          aria-pressed={view === "map"}
          onClick={() => setView("map")}
          className={`border-l border-ink-300 ${toggleClass(view === "map")}`}
        >
          {t.viewMap}
        </button>
      </div>

      {view === "list" ? children : <ProviderMapView filters={filters} />}
    </div>
  );
}
