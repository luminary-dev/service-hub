import { createElement } from "react";
import { categoryIcon, iconByName } from "@/lib/constants";

// Renders a category's icon. Prefers an admin-assigned icon name (Category.icon,
// #436) when it resolves to a known component; otherwise falls back to the
// slug-based default map (and a generic tools icon for unknown slugs).
export default function CategoryIcon({
  slug,
  icon,
  className,
}: {
  slug: string;
  icon?: string | null;
  className?: string;
}) {
  return createElement(iconByName(icon) ?? categoryIcon(slug), { className });
}
