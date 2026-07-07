import { FaCircleCheck } from "@/components/icons";

export default function VerifiedBadge({
  label,
  size = "sm",
}: {
  label: string;
  size?: "sm" | "md";
}) {
  const cls = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span
      className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200"
      title={label}
    >
      <FaCircleCheck className={cls} />
      {label}
    </span>
  );
}
