"use client";

// Optional map-pin location picker (#48, search & discovery RFC phase 1),
// shared by the provider registration wizard and the dashboard profile form.
// The Leaflet map is progressive enhancement, dynamically imported client-side
// only (leaflet touches `window` at import time, so it must never SSR); the
// manual latitude/longitude inputs are the always-available keyboard path —
// pinning is entirely optional and skipping it costs nothing.
import dynamic from "next/dynamic";
import { useState } from "react";
import { isWithinSriLanka, type GeoPoint } from "@/lib/geo";
import { useT } from "@/components/I18nProvider";

function MapLoadingPlaceholder() {
  const t = useT().location;
  return (
    <div className="flex h-64 w-full items-center justify-center rounded-sm border border-ink-300 bg-ink-100 text-sm text-ink-500">
      {t.mapLoading}
    </div>
  );
}

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => <MapLoadingPlaceholder />,
});

function format(n: number): string {
  // Up to 6 decimals (~0.1 m) without trailing zeros — matches what the map
  // hands back and keeps the inputs readable.
  return String(Number(n.toFixed(6)));
}

export default function LocationPicker({
  id,
  value,
  onChange,
  district,
}: {
  // Prefix for the field ids (`<id>-lat`, `<id>-lng`).
  id: string;
  value: GeoPoint | null;
  onChange: (next: GeoPoint | null) => void;
  // Pre-centers the empty map on the chosen district's centroid.
  district: string;
}) {
  const t = useT().location;
  // The manual inputs keep their own strings so half-typed values don't
  // bounce; only a complete in-bounds pair (or an empty pair) commits to the
  // parent, so the submitted state is always either null or a valid pin.
  const [latStr, setLatStr] = useState(value ? format(value.latitude) : "");
  const [lngStr, setLngStr] = useState(value ? format(value.longitude) : "");
  const [inputError, setInputError] = useState("");

  // Map picks (and external resets/clears) flow back into the inputs — the
  // render-time derived-state pattern, guarded by a prev comparison. When the
  // inputs already parse to the new value (i.e. the change originated from
  // typing), they are left alone so reformatting can't clobber "80." while
  // the user is mid-decimal.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const inputsMatch =
      value !== null &&
      Number(latStr) === value.latitude &&
      Number(lngStr) === value.longitude;
    if (!inputsMatch) {
      setLatStr(value ? format(value.latitude) : "");
      setLngStr(value ? format(value.longitude) : "");
    }
    if (value) setInputError("");
  }

  function commit(nextLat: string, nextLng: string) {
    const latTrim = nextLat.trim();
    const lngTrim = nextLng.trim();
    if (latTrim === "" && lngTrim === "") {
      setInputError("");
      onChange(null);
      return;
    }
    const lat = Number(latTrim);
    const lng = Number(lngTrim);
    if (latTrim === "" || lngTrim === "" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setInputError(t.errPair);
      return;
    }
    if (!isWithinSriLanka(lat, lng)) {
      setInputError(t.errOutOfBounds);
      return;
    }
    setInputError("");
    onChange({ latitude: lat, longitude: lng });
  }

  return (
    <div>
      <span className="label" id={`${id}-label`}>
        {t.label}
      </span>
      <p className="mb-2 text-xs text-ink-500">{t.hint}</p>

      <LocationPickerMap
        value={value}
        district={district}
        mapLabel={t.mapLabel}
        onPick={onChange}
      />

      {/* Keyboard path: the map is mouse/touch-first, so the coordinates are
          always editable directly (#66 a11y baseline). */}
      <p className="mt-2 text-xs text-ink-500">{t.manualHint}</p>
      <div className="mt-1 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor={`${id}-lat`}>
            {t.latitude}
          </label>
          <input
            id={`${id}-lat`}
            className="input w-36"
            type="number"
            inputMode="decimal"
            step="any"
            value={latStr}
            onChange={(e) => {
              setLatStr(e.target.value);
              commit(e.target.value, lngStr);
            }}
            aria-describedby={inputError ? `${id}-error` : undefined}
            aria-invalid={inputError ? true : undefined}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-lng`}>
            {t.longitude}
          </label>
          <input
            id={`${id}-lng`}
            className="input w-36"
            type="number"
            inputMode="decimal"
            step="any"
            value={lngStr}
            onChange={(e) => {
              setLngStr(e.target.value);
              commit(latStr, e.target.value);
            }}
            aria-describedby={inputError ? `${id}-error` : undefined}
            aria-invalid={inputError ? true : undefined}
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="btn-ghost"
          >
            {t.clear}
          </button>
        )}
      </div>

      {/* Status + validation feedback for screen readers and everyone else. */}
      <p aria-live="polite" className="mt-1 text-xs text-ink-500">
        {value ? t.pinSet(value.latitude, value.longitude) : t.pinNotSet}
      </p>
      {inputError && (
        <p id={`${id}-error`} aria-live="polite" className="mt-1 text-xs text-red-600">
          {inputError}
        </p>
      )}
    </div>
  );
}
