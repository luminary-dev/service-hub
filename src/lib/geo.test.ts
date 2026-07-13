import { describe, expect, it } from "vitest";
import { DISTRICTS } from "./constants";
import {
  DISTRICT_CENTROIDS,
  DISTRICT_ZOOM,
  isWithinSriLanka,
  latLngToWorldPixel,
  osmViewUrl,
  pickerStart,
  SL_CENTER,
  SL_DEFAULT_ZOOM,
  staticMapTiles,
  TILE_SIZE,
  tileUrl,
} from "./geo";

describe("isWithinSriLanka", () => {
  it("accepts points on the island", () => {
    expect(isWithinSriLanka(6.9271, 79.8612)).toBe(true); // Colombo
    expect(isWithinSriLanka(9.6615, 80.0255)).toBe(true); // Jaffna
    expect(isWithinSriLanka(5.9549, 80.555)).toBe(true); // Matara
  });

  it("rejects points outside the bounding box", () => {
    expect(isWithinSriLanka(51.5072, -0.1276)).toBe(false); // London
    expect(isWithinSriLanka(13.0827, 80.2707)).toBe(false); // Chennai
    expect(isWithinSriLanka(0, 0)).toBe(false);
  });
});

describe("DISTRICT_CENTROIDS", () => {
  it("covers every district with an in-bounds centroid", () => {
    for (const district of DISTRICTS) {
      const centroid = DISTRICT_CENTROIDS[district];
      expect(centroid, `missing centroid for ${district}`).toBeDefined();
      expect(
        isWithinSriLanka(centroid.latitude, centroid.longitude),
        `${district} centroid out of bounds`
      ).toBe(true);
    }
  });

  it("has no stale entries for renamed/removed districts", () => {
    const known = new Set<string>(DISTRICTS);
    for (const key of Object.keys(DISTRICT_CENTROIDS)) {
      expect(known.has(key), `unknown district ${key}`).toBe(true);
    }
  });
});

describe("pickerStart", () => {
  it("starts at the district centroid when known", () => {
    expect(pickerStart("Kandy")).toEqual({
      center: DISTRICT_CENTROIDS.Kandy,
      zoom: DISTRICT_ZOOM,
    });
  });

  it("falls back to the whole island for unset/unknown districts", () => {
    expect(pickerStart("")).toEqual({ center: SL_CENTER, zoom: SL_DEFAULT_ZOOM });
    expect(pickerStart(null)).toEqual({ center: SL_CENTER, zoom: SL_DEFAULT_ZOOM });
    expect(pickerStart("Atlantis")).toEqual({
      center: SL_CENTER,
      zoom: SL_DEFAULT_ZOOM,
    });
  });
});

describe("osmViewUrl", () => {
  it("builds the openstreetmap.org marker link", () => {
    expect(osmViewUrl(6.9271, 79.8612)).toBe(
      "https://www.openstreetmap.org/?mlat=6.9271&mlon=79.8612#map=15/6.9271/79.8612"
    );
  });
});

// Reference values from the OSM slippy-map spec: at zoom 0 the world is one
// 256px tile and (0°, 0°) projects to its center.
describe("latLngToWorldPixel", () => {
  it("projects the origin to the world center", () => {
    const { x, y } = latLngToWorldPixel(0, 0, 0);
    expect(x).toBeCloseTo(TILE_SIZE / 2, 6);
    expect(y).toBeCloseTo(TILE_SIZE / 2, 6);
  });

  it("doubles pixel coordinates per zoom level", () => {
    const z1 = latLngToWorldPixel(6.9271, 79.8612, 10);
    const z2 = latLngToWorldPixel(6.9271, 79.8612, 11);
    expect(z2.x).toBeCloseTo(z1.x * 2, 6);
    expect(z2.y).toBeCloseTo(z1.y * 2, 6);
  });
});

describe("staticMapTiles", () => {
  it("returns a 3×3 grid with the pin inside the middle tile", () => {
    const { tiles, pinX, pinY } = staticMapTiles(6.9271, 79.8612, 14);
    expect(tiles).toHaveLength(9);
    // Pin offset measured from the grid's top-left: middle tile spans
    // [256, 512) in both axes.
    expect(pinX).toBeGreaterThanOrEqual(TILE_SIZE);
    expect(pinX).toBeLessThan(TILE_SIZE * 2);
    expect(pinY).toBeGreaterThanOrEqual(TILE_SIZE);
    expect(pinY).toBeLessThan(TILE_SIZE * 2);
  });

  it("uses adjacent OSM tile URLs", () => {
    const { x, y } = latLngToWorldPixel(6.9271, 79.8612, 14);
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    const { tiles } = staticMapTiles(6.9271, 79.8612, 14);
    expect(tiles[0].url).toBe(tileUrl(tx - 1, ty - 1, 14));
    expect(tiles[4].url).toBe(tileUrl(tx, ty, 14));
    expect(tiles[8].url).toBe(tileUrl(tx + 1, ty + 1, 14));
    for (const tile of tiles) {
      expect(tile.url).toMatch(
        /^https:\/\/tile\.openstreetmap\.org\/14\/\d+\/\d+\.png$/
      );
    }
  });
});
