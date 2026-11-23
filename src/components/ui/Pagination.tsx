import Link from "next/link";
import { dict, type Locale } from "@/lib/i18n";

// Builds the compact page-number sequence around the current page, e.g.
// 1 … 4 5 [6] 7 8 … 12 — collapsing runs of skipped pages into one ellipsis.
function pageNumbers(page: number, totalPages: number): (number | "gap")[] {
  const delta = 1;
  const left = Math.max(2, page - delta);
  const right = Math.min(totalPages - 1, page + delta);

  const nums: (number | "gap")[] = [1];
  if (left > 2) nums.push("gap");
  for (let i = left; i <= right; i++) nums.push(i);
  if (right < totalPages - 1) nums.push("gap");
  if (totalPages > 1) nums.push(totalPages);
  return nums;
}

// UI 2.0 — the shared pager under paginated listings (#381, redesigned #909):
// numbered pages around the current one, plus Previous/Next that render as
// inert (aria-disabled) instead of disappearing at the bounds. Callers own
// the href building (filters, locale prefix) via `hrefFor`. Server-safe.
export default function Pagination({
  page,
  totalPages,
  hrefFor,
  locale,
  label,
  className = "mt-10",
}: {
  page: number;
  totalPages: number;
  /** Builds the href for a target page (carry the active filters in it). */
  hrefFor: (page: number) => string;
  locale: Locale;
  /** Landmark name override when a page hosts more than one pager. */
  label?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const t = dict[locale].browse;
  const numbers = pageNumbers(page, totalPages);

  return (
    <nav
      aria-label={label ?? t.paginationLabel}
      className={`flex items-center justify-center gap-1.5 ${className}`}
    >
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="btn-secondary">
          {t.prev}
        </Link>
      ) : (
        <span aria-disabled="true" className="btn-secondary pointer-events-none opacity-40">
          {t.prev}
        </span>
      )}

      <span className="flex items-center gap-1">
        {numbers.map((n, i) =>
          n === "gap" ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="px-1.5 font-mono text-sm text-ink-400"
            >
              …
            </span>
          ) : n === page ? (
            <span
              key={n}
              aria-current="page"
              className="flex h-9 min-w-9 items-center justify-center rounded-md border border-brand-600 bg-brand-600 px-2 font-mono text-sm font-semibold tabular-nums text-white"
            >
              {n}
            </span>
          ) : (
            <Link
              key={n}
              href={hrefFor(n)}
              className="flex h-9 min-w-9 items-center justify-center rounded-md border border-ink-300 px-2 font-mono text-sm tabular-nums text-ink-700 transition-colors duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
            >
              {n}
            </Link>
          )
        )}
      </span>

      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className="btn-secondary">
          {t.next}
        </Link>
      ) : (
        <span aria-disabled="true" className="btn-secondary pointer-events-none opacity-40">
          {t.next}
        </span>
      )}
    </nav>
  );
}
