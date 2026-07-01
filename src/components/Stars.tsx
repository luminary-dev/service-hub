import { FaStar } from "react-icons/fa6";

export default function Stars({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "sm" | "md";
}) {
  const cls = size === "md" ? "h-4.5 w-4.5" : "h-3.5 w-3.5";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Rated ${rating.toFixed(1)} out of 5 stars`}
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
