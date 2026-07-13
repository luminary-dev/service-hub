"use client";

// The Leaflet half of the location picker (#48). This module imports leaflet
// (and its stylesheet) directly, so it must only ever load in the browser —
// LocationPicker mounts it via next/dynamic with ssr:false; nothing else may
// import it. Plain leaflet with a thin React wrapper (no react-leaflet) keeps
// the dependency surface to one small BSD-2-Clause package.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  pickerStart,
  type GeoPoint,
} from "@/lib/geo";

// Inline SVG pin instead of Leaflet's default marker: the default icon
// resolves image URLs relative to the leaflet package, which bundlers break
// (the classic missing-marker bug), and a divIcon needs no extra assets.
const pinIcon = L.divIcon({
  className: "", // no default leaflet-div-icon box/shadow styles
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path fill="#1d4ed8" stroke="#ffffff" stroke-width="1.2" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.6" fill="#ffffff"/></svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 32], // tip of the pin
});

export default function LocationPickerMap({
  value,
  district,
  mapLabel,
  onPick,
}: {
  // The current pin, if any.
  value: GeoPoint | null;
  // Pre-centers the empty map on the chosen district's centroid.
  district: string;
  // Localized accessible name for the map region.
  mapLabel: string;
  onPick: (point: GeoPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // The click/drag handlers must see the latest onPick without re-creating
  // the map on every render.
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // Create the map once. The initial viewport is the pin when editing an
  // already-pinned profile, else the district centroid, else the island.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = pickerStart(district);
    const map = L.map(containerRef.current, {
      center: value
        ? [value.latitude, value.longitude]
        : [start.center.latitude, start.center.longitude],
      zoom: value ? 14 : start.zoom,
      scrollWheelZoom: false, // don't hijack page scroll inside a long form
    });
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onPickRef.current({
        latitude: Number(e.latlng.lat.toFixed(6)),
        longitude: Number(e.latlng.lng.toFixed(6)),
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mount-only on purpose: district/value changes are handled below without
    // rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center the empty map when the provider changes their district.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || value) return;
    const start = pickerStart(district);
    map.setView([start.center.latitude, start.center.longitude], start.zoom);
  }, [district, value]);

  // Keep the (draggable) marker in step with the pin value.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = L.marker([value.latitude, value.longitude], {
        draggable: true,
        icon: pinIcon,
        keyboard: false, // the manual inputs are the keyboard path
      }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onPickRef.current({
          latitude: Number(pos.lat.toFixed(6)),
          longitude: Number(pos.lng.toFixed(6)),
        });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([value.latitude, value.longitude]);
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={mapLabel}
      className="h-64 w-full rounded-sm border border-ink-300"
      data-testid="location-picker-map"
    />
  );
}
