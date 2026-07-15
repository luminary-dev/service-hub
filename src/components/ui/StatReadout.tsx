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
  wrap = false,
  className = "",
}: {
  stats: Stat[];
  /** Minimum digit width for numeric values (zero-padded). */
  pad?: number;
  /**
   * Reflow the readout into an even 2-column grid on mobile instead of a
   * single row (which overflows / crams four instruments at ~390px). Falls
   * back to the horizontal flex row from `sm` up. Opt-in so single-stat
   * headers keep hugging their content (#708).
   */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <dl
      className={`gap-3 ${
        wrap ? "grid grid-cols-2 sm:flex sm:flex-wrap" : "flex"
      } ${className}`}
    >
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
