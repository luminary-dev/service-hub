import type { ReactNode } from "react";

export type Stat = {
  label: ReactNode;
  value: number | string;
};

// UI 2.0 — tech-corners stat readout.
//
// The drafting-bracket stat boxes from the registry header: a horizontal `dl`
// of `tech-corners` panels, each a big `font-mono` `tabular-nums` figure over a
// mono uppercase caption. Numeric values are zero-padded (default width 2) so
// the readout keeps a fixed-width "instrument" look; string values render as
// given. Extracted from providers/page.tsx. Server-safe.
export default function StatReadout({
  stats,
  pad = 2,
  className = "",
}: {
  stats: Stat[];
  /** Minimum digit width for numeric values (zero-padded). */
  pad?: number;
  className?: string;
}) {
  return (
    <dl className={`flex gap-3 ${className}`}>
      {stats.map(({ label, value }, i) => (
        <div
          key={i}
          className="tech-corners min-w-[92px] border border-ink-300 bg-surface px-4 py-3"
        >
          <dd className="font-mono text-2xl font-bold tabular-nums text-ink-900">
            {typeof value === "number" ? String(value).padStart(pad, "0") : value}
          </dd>
          <dt className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
            {label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
