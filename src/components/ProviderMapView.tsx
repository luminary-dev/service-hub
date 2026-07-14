"use client";

// The providers map view (#48, search RFC phase 3): "near me" discovery over
// GET /api/search/providers/nearby. List-first a11y: the map itself is
// progressive enhancement — every result also renders as a regular provider
// card in the list below (with its distance), a skip link jumps past the map,
// and geolocation denial falls back to centering on a chosen district.
// Leaflet touches `window` at import time, so the map half loads client-side
// only via next/dynamic; everything else here (controls, status, list) is the
// always-available keyboard path.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaMagnifyingGlass } from "@/components/icons";
import ProviderCard, { type ProviderCardDTO } from "@/components/ProviderCard";
import type { ProviderMapMarker } from "@/components/ProviderMap";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLocale, useT } from "@/components/I18nProvider";
import { DISTRICTS } from "@/lib/constants";
import { DISTRICT_CENTROIDS, type GeoPoint } from "@/lib/geo";
import { categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import { nearbySearchPath, type BrowseFilters } from "@/lib/search-params";

// Radius choices around the service's default (25) and cap (100) — see
// search-service lib/query.ts.
const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
const DEFAULT_RADIUS_KM = 25;

function MapLoadingPlaceholder() {
  const t = useT().location;
  return (
    <div className="flex h-80 w-full items-center justify-center rounded-sm border border-ink-300 bg-ink-100 text-sm text-ink-500 sm:h-96">
      {t.mapLoading}
    </div>
  );
}

const ProviderMap = dynamic(() => import("./ProviderMap"), {
  ssr: false,
  loading: () => <MapLoadingPlaceholder />,
});

type NearbyResponse = {
  providers: ProviderCardDTO[];
  total: number;
};

export default function ProviderMapView({
  filters,
}: {
  // The active browse filters — the map applies the same set the list does.
  filters: BrowseFilters;
}) {
  const locale = useLocale();
  const t = useT().browse;
  // The search point: the geolocation fix, or a district centroid. Starts on
  // the filtered district (when there is one) so the map is useful without
  // granting location access.
  const [center, setCenter] = useState<GeoPoint | null>(
    () => DISTRICT_CENTROIDS[filters.district] ?? null
  );
  const [centerDistrict, setCenterDistrict] = useState(
    DISTRICT_CENTROIDS[filters.district] ? filters.district : ""
  );
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [geoStatus, setGeoStatus] = useState<"" | "locating" | "denied">("");
  // Loading/error are DERIVED from which request path last landed/failed —
  // no synchronous setState in the fetch effect, and a change of center,
  // radius or filters implicitly resets both.
  const [loaded, setLoaded] = useState<{
    path: string;
    providers: ProviderCardDTO[];
  } | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const searchPath = useMemo(
    () => (center ? nearbySearchPath(filters, center, radiusKm) : null),
    // The filters object is a fresh literal per parent render — depend on the
    // fields so the fetch effect doesn't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      center,
      radiusKm,
      filters.q,
      filters.category,
      filters.district,
      filters.priceMin,
      filters.priceMax,
      filters.ratingMin,
      filters.availableOnly,
    ]
  );

  useEffect(() => {
    if (!searchPath) return;
    const ctrl = new AbortController();
    fetch(searchPath, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`nearby ${res.status}`);
        return res.json() as Promise<NearbyResponse>;
      })
      .then((data) => setLoaded({ path: searchPath, providers: data.providers }))
      .catch(() => {
        if (!ctrl.signal.aborted) setFailedPath(searchPath);
      });
    return () => ctrl.abort();
  }, [searchPath, retryTick]);

  const error = searchPath !== null && failedPath === searchPath;
  // Stale results keep showing while a new search point/radius loads; the
  // skeleton only covers the very first load.
  const results = loaded?.providers ?? null;
  const loading =
    searchPath !== null && !error && loaded?.path !== searchPath;

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus("");
        setCenterDistrict("");
        setCenter({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      // Denied / unavailable / timeout all land here — the district select
      // below is the fallback path (RFC §7).
      () => setGeoStatus("denied"),
      { timeout: 10_000, maximumAge: 60_000 }
    );
  }

  // A marker's activation (click or Enter) selects the matching list card —
  // the list is the canonical representation, so selection means "take me to
  // that card".
  const selectCard = useCallback((id: string) => {
    const el = document.getElementById(`map-card-${id}`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  const markers: ProviderMapMarker[] = (results ?? []).flatMap((p) =>
    p.latitude !== undefined && p.longitude !== undefined
      ? [
          {
            id: p.id,
            latitude: p.latitude,
            longitude: p.longitude,
            label: t.markerLabel(
              p.name,
              categoryLabelLoc(p.category, locale),
              p.distanceKm ?? 0
            ),
          },
        ]
      : []
  );

  return (
    <div className="mt-6">
      {/* Center + radius controls: "near me", the district fallback, radius. */}
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <button
          type="button"
          className="btn-primary"
          onClick={locate}
          disabled={geoStatus === "locating"}
        >
          {geoStatus === "locating" ? t.locating : t.nearMe}
        </button>
        <div>
          <label className="label" htmlFor="map-center-district">
            {t.centerDistrict}
          </label>
          <select
            id="map-center-district"
            className="input cursor-pointer sm:w-44"
            value={centerDistrict}
            onChange={(e) => {
              const district = e.target.value;
              setCenterDistrict(district);
              const centroid = DISTRICT_CENTROIDS[district];
              if (centroid) setCenter(centroid);
            }}
          >
            <option value="">{t.allDistricts}</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {districtLabelLoc(d, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="map-radius">
            {t.radiusLabel}
          </label>
          <select
            id="map-radius"
            className="input cursor-pointer sm:w-32"
            value={String(radiusKm)}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
          >
            {RADIUS_OPTIONS.map((km) => (
              <option key={km} value={String(km)}>
                {t.radiusOption(km)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Geolocation + result-count announcements for screen readers (and
          everyone else). */}
      <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-500">
        {geoStatus === "denied"
          ? t.geoDenied
          : geoStatus === "locating"
            ? t.locating
            : center && results !== null && !loading && !error
              ? t.mapCount(results.length, radiusKm)
              : ""}
      </p>

      {!center ? (
        // No search point yet: prompt for "near me" or a district.
        <EmptyState
          icon={FaMagnifyingGlass}
          title={t.viewMap}
          body={t.mapPrompt}
          className="mt-4"
        />
      ) : error ? (
        <div role="alert" className="card mt-4 flex flex-col items-center px-6 py-12 text-center">
          <p className="text-sm text-ink-700">{t.mapError}</p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => {
              setFailedPath(null);
              setRetryTick((n) => n + 1);
            }}
          >
            {t.mapRetry}
          </button>
        </div>
      ) : (
        <>
          {/* Keyboard users can bypass the (supplementary) map entirely. */}
          <a
            href="#map-result-list"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-full focus:bg-brand-700 focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white dark:focus:text-ink-50"
          >
            {t.skipMap}
          </a>
          <div className="relative mt-4">
            <ProviderMap
              center={center}
              radiusKm={radiusKm}
              markers={markers}
              mapLabel={t.mapRegionLabel}
              onSelect={selectCard}
            />
          </div>

          <h2 className="sr-only">{t.mapListLabel}</h2>
          {loading && results === null ? (
            // First load for this search point: shimmer where the cards go.
            <div
              className="mt-5 grid animate-pulse gap-5 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="map-results-loading"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card p-4">
                  <Skeleton tone="strong" className="h-24 rounded" />
                  <Skeleton className="mt-3 h-4 w-40 rounded" />
                  <Skeleton className="mt-2 h-3 w-56 rounded" />
                </div>
              ))}
            </div>
          ) : results !== null && results.length === 0 ? (
            <EmptyState
              icon={FaMagnifyingGlass}
              title={t.mapEmptyTitle}
              body={t.mapEmptyBody}
              className="mt-5"
            />
          ) : (
            <ul
              id="map-result-list"
              className="mt-5 grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {(results ?? []).map((p) => (
                <li
                  key={p.id}
                  id={`map-card-${p.id}`}
                  tabIndex={-1}
                  className="rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  <ProviderCard p={p} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
