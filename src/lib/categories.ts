// Managed category options (#135/#60). The canonical list lives in
// provider-service's Category table and is fetched via GET /api/categories
// (see categories-server.ts); the static CATEGORIES constants remain as the
// degradation fallback when that fetch fails. This module stays client-safe —
// client components receive the options as props from server components.
import { CATEGORIES } from "./constants";
import { categoryLabelLoc, type Locale } from "./i18n";

export type CategoryOption = {
  slug: string;
  labelEn: string;
  labelSi: string;
  icon: string | null;
};

// Fallback built from the static constants (English labels) and the i18n
// Sinhala map — the same data the database was seeded from.
export const STATIC_CATEGORY_OPTIONS: CategoryOption[] = CATEGORIES.map(
  (c) => ({
    slug: c.slug,
    labelEn: c.label,
    labelSi: categoryLabelLoc(c.slug, "si"),
    icon: null,
  })
);

export function categoryOptionLabel(c: CategoryOption, locale: Locale): string {
  return locale === "si" ? c.labelSi : c.labelEn;
}
