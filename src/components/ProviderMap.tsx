"use client";

// The Leaflet half of the providers map view (#48, search RFC phase 3). Like
// LocationPickerMap, this module imports leaflet (and its stylesheet)
// directly, so it must only ever load in the browser — ProviderMapView mounts
// it via next/dynamic with ssr:false; nothing else may import it.
//
// A11y contract (RFC §7): the map is supplementary — every marker's provider
// also appears in the adjacent result list, which stays the primary
// accessible interface. Markers are still keyboard-focusable (Leaflet's
// `keyboard: true` tabs to them and fires click on Enter) and carry an
// accessible "{name}, {category}, {distance} km" label; activating one hands
// focus to the matching list card via `onSelect`.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  type GeoPoint,
} from "@/lib/geo";

export type ProviderMapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  // Localized accessible name ("{name}, {category}, {distance} km").
  label: string;
};

// Same inline SVG pin as the location picker — Leaflet's default icon
// resolves image URLs relative to the package, which bundlers break, and a
// divIcon needs no extra assets.
const pinIcon = L.divIcon({
  className: "", // no default leaflet-div-icon box/shadow styles
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="#1d4ed8" stroke="#ffffff" stroke-width="1.2" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.6" fill="#ffffff"/></svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28], // tip of the pin
});

// A viewport that shows (roughly) the whole search circle for each of the
// radius options; the user can still zoom/pan freely afterwards.
export function zoomForRadiusKm(radiusKm: number): number {
  if (radiusKm <= 5) return 12;
  if (radiusKm <= 10) return 11;
  if (radiusKm <= 25) return 10;
  if (radiusKm <= 50) return 9;
  return 8;
}

export default function ProviderMap({
  center,
  radiusKm,
  markers,
  mapLabel,
  onSelect,
}: {
  // The search point ("near me" fix or a district centroid).
  center: GeoPoint;
  radiusKm: number;
  markers: ProviderMapMarker[];
  // Localized accessible name for the map region.
  mapLabel: string;
  // Activating a marker (click, or Enter on a focused one) selects the
  // matching card in the adjacent result list.
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  // Handlers must see the latest onSelect without rebuilding markers.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once; center/radius/marker changes are applied below
  // without rebuilding it.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [center.latitude, center.longitude],
      zoom: zoomForRadiusKm(radiusKm),
      scrollWheelZoom: false, // don't hijack page scroll mid-browse
    });
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      circleRef.current = null;
    };
    // Mount-only on purpose — see the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-frame on a new search point or radius, and outline the search circle
  // so "within X km" is visible on the map itself.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(
      [center.latitude, center.longitude],
      zoomForRadiusKm(radiusKm)
    );
    if (!circleRef.current) {
      circleRef.current = L.circle([center.latitude, center.longitude], {
        radius: radiusKm * 1000,
        color: "#1d4ed8",
        weight: 1,
        fillOpacity: 0.04,
        interactive: false,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng([center.latitude, center.longitude]);
      circleRef.current.setRadius(radiusKm * 1000);
    }
  }, [center.latitude, center.longitude, radiusKm]);

  // Keep the pins in step with the result set.
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const m of markers) {
      const marker = L.marker([m.latitude, m.longitude], {
        icon: pinIcon,
        // Tab-focusable; Enter fires the click handler (Leaflet built-in).
        keyboard: true,
        title: m.label,
      });
      marker.on("click", () => onSelectRef.current(m.id));
      marker.addTo(layer);
      // divIcon markers are plain <div>s — give the focusable element a role
      // and an accessible name (RFC: "{name}, {category}, {distance} km").
      const el = marker.getElement();
      if (el) {
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", m.label);
      }
    }
  }, [markers]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={mapLabel}
      className="h-80 w-full rounded-sm border border-ink-300 sm:h-96"
      data-testid="provider-map"
    />
  );
}
