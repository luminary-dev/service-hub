import type { ReactNode } from "react";

// UI 2.0 — blueprint-grid header band.
//
// The registry-style page header shared across the redesign: a graph-paper
// `blueprint-grid` band carrying a mono uppercase eyebrow (with an optional
// small `bg-brand-700` tag), an h1, an optional `pulse-dot` status/subtitle
// line, and an optional right-aligned slot (e.g. a <StatReadout>). Extracted
// verbatim from the providers listing header so later pages compose it instead
// of re-implementing the markup. Server-safe (no interactivity).
export default function PageHeader({
  tag,
  eyebrow,
  title,
  status,
  children,
  className = "",
}: {
  /** Small solid `bg-brand-700` tag beside the eyebrow, e.g. "REG". */
  tag?: ReactNode;
  /** Mono uppercase spec label (the muted text after the tag). */
  eyebrow?: ReactNode;
  /** Primary heading. */
  title: ReactNode;
  /** Optional line under the title, prefixed with a live `pulse-dot`. */
  status?: ReactNode;
  /** Optional right-aligned slot (stats readout, actions, …). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`blueprint-grid border-b border-ink-300 bg-ink-50 ${className}`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-8 px-4 py-10 sm:px-6">
        <div>
          {(tag || eyebrow) && (
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
              {tag && (
                <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
                  {tag}
                </span>
              )}
              {eyebrow && <span className="text-ink-500">{eyebrow}</span>}
            </div>
          )}
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
            {title}
          </h1>
          {status && (
            <p className="mt-2 flex items-center gap-2 font-mono text-sm text-ink-500">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
              {status}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
