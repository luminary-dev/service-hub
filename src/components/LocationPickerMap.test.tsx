// @vitest-environment jsdom
//
// Map-half wiring tests (#48) with leaflet fully mocked (it manipulates the
// real DOM and can't run under jsdom): initial viewport selection (pin >
// district centroid > island), click→onPick rounding, and marker lifecycle.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  DISTRICT_CENTROIDS,
  DISTRICT_ZOOM,
  SL_CENTER,
  SL_DEFAULT_ZOOM,
} from "@/lib/geo";

type MapOptions = { center: [number, number]; zoom: number };
type ClickHandler = (e: { latlng: { lat: number; lng: number } }) => void;

const { leaflet } = vi.hoisted(() => {
  const mapInstance = {
    on: vi.fn<(event: string, handler: unknown) => void>(),
    setView: vi.fn(),
    remove: vi.fn(),
  };
  const markerInstance = {
    addTo: vi.fn<() => unknown>(),
    on: vi.fn(),
    setLatLng: vi.fn(),
    remove: vi.fn(),
    getLatLng: vi.fn(() => ({ lat: 6.93, lng: 79.87 })),
  };
  markerInstance.addTo.mockReturnValue(markerInstance);
  return {
    leaflet: {
      map: vi.fn<(el: unknown, options: unknown) => typeof mapInstance>(
        () => mapInstance
      ),
      tileLayer: vi.fn<(url: string, options: unknown) => { addTo: unknown }>(
        () => ({ addTo: vi.fn() })
      ),
      marker: vi.fn<(pos: unknown, options: unknown) => typeof markerInstance>(
        () => markerInstance
      ),
      divIcon: vi.fn(() => ({})),
      mapInstance,
      markerInstance,
    },
  };
});

vi.mock("leaflet", () => ({ default: leaflet }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import LocationPickerMap from "./LocationPickerMap";

beforeEach(() => {
  leaflet.map.mockClear();
  leaflet.tileLayer.mockClear();
  leaflet.marker.mockClear();
  leaflet.mapInstance.on.mockClear();
  leaflet.mapInstance.setView.mockClear();
  leaflet.markerInstance.on.mockClear();
  leaflet.markerInstance.setLatLng.mockClear();
  leaflet.markerInstance.remove.mockClear();
});

afterEach(cleanup);

const label = "Map of Sri Lanka";

describe("LocationPickerMap (#48)", () => {
  it("starts on the district centroid when unpinned", () => {
    render(
      <LocationPickerMap
        value={null}
        district="Kandy"
        mapLabel={label}
        onPick={vi.fn()}
      />
    );
    const options = leaflet.map.mock.calls[0][1] as MapOptions;
    expect(options.center).toEqual([
      DISTRICT_CENTROIDS.Kandy.latitude,
      DISTRICT_CENTROIDS.Kandy.longitude,
    ]);
    expect(options.zoom).toBe(DISTRICT_ZOOM);
    // No pin yet → no marker.
    expect(leaflet.marker).not.toHaveBeenCalled();
    // OSM tiles carry the required attribution.
    expect(
      (leaflet.tileLayer.mock.calls[0][1] as { attribution: string }).attribution
    ).toContain("OpenStreetMap");
  });

  it("falls back to the whole island while no district is chosen", () => {
    render(
      <LocationPickerMap value={null} district="" mapLabel={label} onPick={vi.fn()} />
    );
    const options = leaflet.map.mock.calls[0][1] as MapOptions;
    expect(options.center).toEqual([SL_CENTER.latitude, SL_CENTER.longitude]);
    expect(options.zoom).toBe(SL_DEFAULT_ZOOM);
  });

  it("starts zoomed to the pin and places a draggable marker when pinned", () => {
    render(
      <LocationPickerMap
        value={{ latitude: 6.9271, longitude: 79.8612 }}
        district="Colombo"
        mapLabel={label}
        onPick={vi.fn()}
      />
    );
    const options = leaflet.map.mock.calls[0][1] as MapOptions;
    expect(options.center).toEqual([6.9271, 79.8612]);
    expect(leaflet.marker).toHaveBeenCalledWith(
      [6.9271, 79.8612],
      expect.objectContaining({ draggable: true })
    );
  });

  it("reports a map click as a rounded pick", () => {
    const onPick = vi.fn();
    render(
      <LocationPickerMap value={null} district="Colombo" mapLabel={label} onPick={onPick} />
    );
    const clickHandler = leaflet.mapInstance.on.mock.calls.find(
      (c) => c[0] === "click"
    )![1] as ClickHandler;
    clickHandler({ latlng: { lat: 6.92710000001, lng: 79.86120000001 } });
    expect(onPick).toHaveBeenCalledWith({ latitude: 6.9271, longitude: 79.8612 });
  });

  it("removes the marker when the pin is cleared", () => {
    const { rerender } = render(
      <LocationPickerMap
        value={{ latitude: 6.9271, longitude: 79.8612 }}
        district="Colombo"
        mapLabel={label}
        onPick={vi.fn()}
      />
    );
    rerender(
      <LocationPickerMap value={null} district="Colombo" mapLabel={label} onPick={vi.fn()} />
    );
    expect(leaflet.markerInstance.remove).toHaveBeenCalled();
    // …and the view returns to the district start.
    expect(leaflet.mapInstance.setView).toHaveBeenCalledWith(
      [DISTRICT_CENTROIDS.Colombo.latitude, DISTRICT_CENTROIDS.Colombo.longitude],
      DISTRICT_ZOOM
    );
  });

  it("names the map region for assistive tech", () => {
    const { getByRole } = render(
      <LocationPickerMap value={null} district="Colombo" mapLabel={label} onPick={vi.fn()} />
    );
    expect(getByRole("application", { name: label })).toBeTruthy();
  });
});
