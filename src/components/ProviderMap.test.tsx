// @vitest-environment jsdom
//
// Map-view leaflet wiring tests (#48, search RFC phase 3) with leaflet fully
// mocked (it manipulates the real DOM and can't run under jsdom): OSM tiles +
// attribution, the accessible/keyboard marker contract, marker→list selection
// and the center/radius viewport updates.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

type ClickHandler = () => void;

const { leaflet, madeMarkers } = vi.hoisted(() => {
  const mapInstance = {
    setView: vi.fn(),
    remove: vi.fn(),
  };
  const layerGroupInstance = {
    addTo: vi.fn<() => unknown>(),
    clearLayers: vi.fn(),
    addLayer: vi.fn(),
  };
  layerGroupInstance.addTo.mockReturnValue(layerGroupInstance);
  const circleInstance = {
    addTo: vi.fn<() => unknown>(),
    setLatLng: vi.fn(),
    setRadius: vi.fn(),
  };
  circleInstance.addTo.mockReturnValue(circleInstance);
  type MockMarker = {
    options: { keyboard?: boolean; title?: string };
    element: HTMLElement;
    handlers: Map<string, ClickHandler>;
    addTo: (layer: unknown) => MockMarker;
    on: (event: string, handler: ClickHandler) => void;
    getElement: () => HTMLElement;
  };
  const madeMarkers: MockMarker[] = [];
  return {
    madeMarkers,
    leaflet: {
      map: vi.fn<(el: unknown, options: unknown) => typeof mapInstance>(
        () => mapInstance
      ),
      tileLayer: vi.fn<(url: string, options: unknown) => { addTo: unknown }>(
        () => ({ addTo: vi.fn() })
      ),
      layerGroup: vi.fn(() => layerGroupInstance),
      circle: vi.fn<(pos: unknown, options: unknown) => typeof circleInstance>(
        () => circleInstance
      ),
      divIcon: vi.fn(() => ({})),
      marker: vi.fn((pos: unknown, options: MockMarker["options"]) => {
        const marker: MockMarker = {
          options,
          element: document.createElement("div"),
          handlers: new Map(),
          addTo: () => marker,
          on: (event, handler) => void marker.handlers.set(event, handler),
          getElement: () => marker.element,
        };
        madeMarkers.push(marker);
        return marker;
      }),
      mapInstance,
      layerGroupInstance,
      circleInstance,
    },
  };
});

vi.mock("leaflet", () => ({ default: leaflet }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import ProviderMap, { zoomForRadiusKm } from "./ProviderMap";

beforeEach(() => {
  leaflet.map.mockClear();
  leaflet.tileLayer.mockClear();
  leaflet.marker.mockClear();
  leaflet.circle.mockClear();
  leaflet.mapInstance.setView.mockClear();
  leaflet.layerGroupInstance.clearLayers.mockClear();
  leaflet.circleInstance.setLatLng.mockClear();
  leaflet.circleInstance.setRadius.mockClear();
  madeMarkers.length = 0;
});

afterEach(cleanup);

const center = { latitude: 6.9271, longitude: 79.8612 };
const markers = [
  { id: "prov_1", latitude: 6.93, longitude: 79.87, label: "Sunil, Electrician, 1.2 km" },
  { id: "prov_2", latitude: 6.91, longitude: 79.85, label: "Kamal, Plumber, 2.5 km" },
];
const label = "Map of nearby professionals";

function renderMap(onSelect = vi.fn(), radiusKm = 25) {
  return {
    onSelect,
    ...render(
      <ProviderMap
        center={center}
        radiusKm={radiusKm}
        markers={markers}
        mapLabel={label}
        onSelect={onSelect}
      />
    ),
  };
}

describe("ProviderMap (#48)", () => {
  it("renders OSM tiles with the required attribution and names the region", () => {
    const { getByRole } = renderMap();
    expect(
      (leaflet.tileLayer.mock.calls[0][1] as { attribution: string }).attribution
    ).toContain("OpenStreetMap");
    expect(getByRole("application", { name: label })).toBeTruthy();
  });

  it("creates keyboard-focusable markers with accessible names", () => {
    renderMap();
    expect(madeMarkers).toHaveLength(2);
    // Leaflet's keyboard option = tab focus + Enter-to-click.
    expect(madeMarkers[0].options.keyboard).toBe(true);
    // divIcon markers are plain divs, so the element carries role + label.
    expect(madeMarkers[0].element.getAttribute("role")).toBe("button");
    expect(madeMarkers[0].element.getAttribute("aria-label")).toBe(
      "Sunil, Electrician, 1.2 km"
    );
    expect(madeMarkers[1].element.getAttribute("aria-label")).toBe(
      "Kamal, Plumber, 2.5 km"
    );
  });

  it("activating a marker selects the matching provider card", () => {
    const { onSelect } = renderMap();
    madeMarkers[1].handlers.get("click")!();
    expect(onSelect).toHaveBeenCalledWith("prov_2");
  });

  it("frames the search circle and re-frames on center/radius changes", () => {
    const { rerender } = renderMap(vi.fn(), 25);
    expect(leaflet.mapInstance.setView).toHaveBeenCalledWith(
      [center.latitude, center.longitude],
      zoomForRadiusKm(25)
    );
    expect(leaflet.circle).toHaveBeenCalledWith(
      [center.latitude, center.longitude],
      expect.objectContaining({ radius: 25_000 })
    );

    rerender(
      <ProviderMap
        center={{ latitude: 7.2906, longitude: 80.6337 }}
        radiusKm={50}
        markers={markers}
        mapLabel={label}
        onSelect={vi.fn()}
      />
    );
    expect(leaflet.mapInstance.setView).toHaveBeenLastCalledWith(
      [7.2906, 80.6337],
      zoomForRadiusKm(50)
    );
    expect(leaflet.circleInstance.setLatLng).toHaveBeenCalledWith([7.2906, 80.6337]);
    expect(leaflet.circleInstance.setRadius).toHaveBeenCalledWith(50_000);
  });

  it("rebuilds the pins when the result set changes", () => {
    const { rerender } = renderMap();
    leaflet.layerGroupInstance.clearLayers.mockClear();
    madeMarkers.length = 0;
    rerender(
      <ProviderMap
        center={center}
        radiusKm={25}
        markers={[markers[0]]}
        mapLabel={label}
        onSelect={vi.fn()}
      />
    );
    expect(leaflet.layerGroupInstance.clearLayers).toHaveBeenCalled();
    expect(madeMarkers).toHaveLength(1);
  });

  it("zoomForRadiusKm widens the viewport as the radius grows", () => {
    expect(zoomForRadiusKm(5)).toBeGreaterThan(zoomForRadiusKm(25));
    expect(zoomForRadiusKm(25)).toBeGreaterThan(zoomForRadiusKm(100));
  });
});
