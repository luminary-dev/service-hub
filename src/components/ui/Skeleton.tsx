// UI 2.0 — loading placeholders (#381).
//
// `Skeleton` is one shimmer block: `tone` picks the fill (strong `bg-ink-200`
// for headings/avatars, soft `bg-ink-100` for body lines) and `className`
// carries the shape (h-* / w-* / rounded-*). The `animate-pulse` lives on the
// nearest container so card borders shimmer along with the blocks.
// `SkeletonList` is the standard placeholder for a card list (avatar, two
// lines, trailing pill) used by the admin/dashboard loading states.
// Server-safe.
export function Skeleton({
  tone = "soft",
  className = "",
}: {
  tone?: "strong" | "soft";
  className?: string;
}) {
  return (
    <div
      className={`${tone === "strong" ? "bg-ink-200" : "bg-ink-100"} ${className}`}
    />
  );
}

export function SkeletonList({
  rows = 6,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="card flex items-center justify-between gap-4 p-4"
        >
          <div className="flex items-center gap-3">
            <Skeleton tone="strong" className="h-10 w-10 rounded-full" />
            <div>
              <Skeleton tone="strong" className="h-4 w-40 rounded" />
              <Skeleton className="mt-2 h-3 w-56 rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}
