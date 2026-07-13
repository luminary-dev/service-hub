"use client";

import { DISTRICTS, MAX_SERVICE_DISTRICTS } from "@/lib/constants";
import { districtLabelLoc } from "@/lib/i18n";
import { useLocale, useT } from "@/components/I18nProvider";

// Multi-district service area picker (#502): a toggle-chip group over the 25
// districts, modeled on the register wizard's category toggle group. The home
// district (`primary`) is pinned — always selected, not removable — and
// `value` holds only the EXTRA districts, so a primary-district change never
// needs to rewrite the selection. Extras are capped so home + extras stays
// within MAX_SERVICE_DISTRICTS.
export default function ServiceDistrictsPicker({
  id,
  primary,
  value,
  onChange,
  hasError = false,
}: {
  id: string;
  // The home district; "" while the wizard hasn't collected it yet.
  primary: string;
  value: string[];
  onChange: (next: string[]) => void;
  // Field-error wiring (#378): when the owning form flags this field, the
  // group is described by the caller-owned `<id>-error` message (an
  // ErrorSummary entry or inline alert).
  hasError?: boolean;
}) {
  const locale = useLocale();
  const t = useT().serviceDistricts;
  const extras = value.filter((d) => d !== primary);
  const maxExtras = MAX_SERVICE_DISTRICTS - 1;
  const full = extras.length >= maxExtras;

  function toggle(d: string) {
    if (extras.includes(d)) onChange(extras.filter((x) => x !== d));
    else if (!full) onChange([...extras, d]);
  }

  return (
    <div>
      {/* Toggle group, not a single field — named via aria-labelledby like
          the category picker. */}
      <span className="label" id={`${id}-label`}>
        {t.label}
      </span>
      <p className="mb-2 text-xs text-ink-500">{t.hint}</p>
      {/* id + tabIndex let an error-summary link land focus on the group;
          aria-invalid is not valid on `group`, so only the error text is
          linked via aria-describedby (mirrors the wizard's category group). */}
      <div
        role="group"
        id={id}
        tabIndex={-1}
        aria-labelledby={`${id}-label`}
        aria-describedby={hasError ? `${id}-error` : undefined}
        className="flex flex-wrap gap-2 focus:outline-none"
      >
        {DISTRICTS.map((d) => {
          const isPrimary = d === primary;
          const selected = isPrimary || extras.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={selected}
              disabled={isPrimary || (!selected && full)}
              onClick={() => toggle(d)}
              className={`rounded-sm border px-3 py-1.5 text-sm transition ${
                selected
                  ? "border-brand-600 bg-brand-600 font-semibold text-white dark:text-ink-50"
                  : "border-ink-300 text-ink-600 hover:border-brand-400 hover:bg-brand-50"
              } disabled:cursor-not-allowed disabled:opacity-90`}
            >
              {districtLabelLoc(d, locale)}
              {isPrimary ? ` · ${t.homeBadge}` : ""}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-1 text-xs text-ink-500">
        {full ? t.limitReached : ""}
      </p>
    </div>
  );
}
