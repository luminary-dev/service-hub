// Server-side category fetch (imports next/headers via api.ts, so it lives
// apart from the client-safe helpers in categories.ts). Server components
// fetch here and pass the options down to client components as props.
import { apiJson } from "./api";
import {
  STATIC_CATEGORY_OPTIONS,
  type CategoryOption,
} from "./categories";

// Active categories from provider-service, in display order. Degrades to the
// static constants on any failure (non-2xx, network error, empty payload) —
// category pickers must keep working through a provider-service outage.
//
// Caching (#57): public pages pass `{ revalidate }` to serve the list from
// the Data Cache (the managed list changes rarely). Session-gated pages that
// are force-dynamic call it without options and stay no-store.
export async function fetchCategoryOptions(opts?: {
  revalidate?: number;
}): Promise<CategoryOption[]> {
  try {
    const data = await apiJson<{ categories: CategoryOption[] }>(
      "/api/categories",
      opts
    );
    if (data && data.categories.length > 0) return data.categories;
  } catch (e) {
    console.error("[categories] fetch failed — using static fallback", e);
  }
  return STATIC_CATEGORY_OPTIONS;
}
