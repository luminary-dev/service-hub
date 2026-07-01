import { createElement } from "react";
import { categoryIcon } from "@/lib/constants";

export default function CategoryIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return createElement(categoryIcon(slug), { className });
}
