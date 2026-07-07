import { FaStar } from "@/components/icons";

export default function Stars({
  rating,
  size = "sm",
  label,
}: {
  rating: number;
  size?: "sm" | "md";
  /** Localized accessible name; callers pass `t.a11y.rated(...)`. */
  label?: string;
}) {
  const cls = size === "md" ? "h-4.5 w-4.5" : "h-3.5 w-3.5";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={label ?? `Rated ${rating.toFixed(1)} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <FaStar
          key={i}
          aria-hidden
          className={`${cls} ${i <= Math.round(rating) ? "text-amber-400" : "text-ink-200"}`}
        />
      ))}
    </span>
  );
}
