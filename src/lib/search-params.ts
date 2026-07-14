// Provider search query building (#48, search RFC phase 3): one place turns
// the browse filter set into the query string both `/api/search/providers`
// (the listing) and `/api/search/providers/nearby` (the map view) accept, so
// the two consumers can't drift. Values are the raw URL/form strings — the
// service does the authoritative normalization (lib/query.ts there).

export type BrowseFilters = {
  q: string;
  category: string;
  district: string;
  priceMin: string;
  priceMax: string;
  ratingMin: string;
  availableOnly: boolean;
};

// The shared relational filters. Callers append their own extras (sort/page
// for the listing; lat/lng/radiusKm/pageSize for the map's nearby query).
export function browseFilterParams(f: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.category) params.set("category", f.category);
  if (f.district) params.set("district", f.district);
  if (f.priceMin) params.set("priceMin", f.priceMin);
  if (f.priceMax) params.set("priceMax", f.priceMax);
  if (f.ratingMin) params.set("ratingMin", f.ratingMin);
  if (f.availableOnly) params.set("availableOnly", "1");
  return params;
}

// The map view's nearby query: the same active filters (a district filter
// stays a service-area membership test, exactly like the list) + center and
// radius, at the service's MAX_PAGE_SIZE (24) so the map shows as many pins
// as one page carries.
export function nearbySearchPath(
  f: BrowseFilters,
  center: { latitude: number; longitude: number },
  radiusKm: number
): string {
  const params = browseFilterParams(f);
  params.set("lat", String(center.latitude));
  params.set("lng", String(center.longitude));
  params.set("radiusKm", String(radiusKm));
  params.set("pageSize", "24");
  return `/api/search/providers/nearby?${params.toString()}`;
}
