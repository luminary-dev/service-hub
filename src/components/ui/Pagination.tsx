import Link from "next/link";
import { dict, type Locale } from "@/lib/i18n";

// UI 2.0 — the shared prev/next pager under paginated listings (#381): a
// centered `<nav>` landmark with Previous/Next `.btn-secondary` links around
// a "Page X of Y" readout, hidden entirely on single-page results. Callers
// own the href building (filters, locale prefix) via `hrefFor`. Server-safe.
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
  return (
    <nav
      aria-label={label ?? t.paginationLabel}
      className={`flex items-center justify-center gap-2 ${className}`}
    >
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className="btn-secondary">
          {t.prev}
        </Link>
      )}
      <span className="px-3 text-sm text-ink-500">
        {t.pageOf(page, totalPages)}
      </span>
      {page < totalPages && (
        <Link href={hrefFor(page + 1)} className="btn-secondary">
          {t.next}
        </Link>
      )}
    </nav>
  );
}
