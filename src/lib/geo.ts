// Geo helpers for provider location capture (#48, search & discovery RFC
// phase 1): the Sri Lanka bounding box (mirrors the server's source of truth
// in services/*/src/lib/field-rules.ts — keep in sync), the static
// district→centroid table that pre-centers the map-pin picker, and the slippy
// tile math behind the public profile's static OSM mini-map.

export type GeoPoint = { latitude: number; longitude: number };

// Loose box around the island + territorial margin. A pin outside is a
// mis-drop, not a valid service location — both the picker and the backend
// reject it.
export const SL_LAT_MIN = 5.7;
export const SL_LAT_MAX = 10.1;
export const SL_LNG_MIN = 79.4;
export const SL_LNG_MAX = 82.1;

export function isWithinSriLanka(latitude: number, longitude: number): boolean {
  return (
    latitude >= SL_LAT_MIN &&
    latitude <= SL_LAT_MAX &&
    longitude >= SL_LNG_MIN &&
    longitude <= SL_LNG_MAX
  );
}

// Whole-island fallback view for the picker before a district is chosen.
export const SL_CENTER: GeoPoint = { latitude: 7.8731, longitude: 80.7718 };
export const SL_DEFAULT_ZOOM = 7;
// A district is a sensible starting viewport; the provider then clicks/drags
// the exact spot.
export const DISTRICT_ZOOM = 10;

// Approximate centroid per district (in practice the district capital — close
// enough to START the map at; never persisted as a provider location, per the
// RFC: a 40 km-wide district centroid masquerading as a pin would produce
// wrong "2 km away" claims later). Keys match DISTRICTS in lib/constants.ts.
export const DISTRICT_CENTROIDS: Record<string, GeoPoint> = {
  Ampara: { latitude: 7.2917, longitude: 81.6724 },
  Anuradhapura: { latitude: 8.3114, longitude: 80.4037 },
  Badulla: { latitude: 6.9934, longitude: 81.055 },
  Batticaloa: { latitude: 7.731, longitude: 81.6747 },
  Colombo: { latitude: 6.9271, longitude: 79.8612 },
  Galle: { latitude: 6.0535, longitude: 80.221 },
  Gampaha: { latitude: 7.0917, longitude: 79.9999 },
  Hambantota: { latitude: 6.1429, longitude: 81.1212 },
  Jaffna: { latitude: 9.6615, longitude: 80.0255 },
  Kalutara: { latitude: 6.5854, longitude: 79.9607 },
  Kandy: { latitude: 7.2906, longitude: 80.6337 },
  Kegalle: { latitude: 7.2513, longitude: 80.3464 },
  Kilinochchi: { latitude: 9.3803, longitude: 80.377 },
  Kurunegala: { latitude: 7.4818, longitude: 80.3609 },
  Mannar: { latitude: 8.981, longitude: 79.9044 },
  Matale: { latitude: 7.4675, longitude: 80.6234 },
  Matara: { latitude: 5.9549, longitude: 80.555 },
  Monaragala: { latitude: 6.8728, longitude: 81.3507 },
  Mullaitivu: { latitude: 9.2671, longitude: 80.8142 },
  "Nuwara Eliya": { latitude: 6.9497, longitude: 80.7891 },
  Polonnaruwa: { latitude: 7.9403, longitude: 81.0188 },
  Puttalam: { latitude: 8.0362, longitude: 79.8283 },
  Ratnapura: { latitude: 6.7056, longitude: 80.3847 },
  Trincomalee: { latitude: 8.5874, longitude: 81.2152 },
  Vavuniya: { latitude: 8.7514, longitude: 80.4971 },
};

// The picker's starting viewport: the chosen district's centroid, or the
// whole island while no district is picked.
export function pickerStart(district: string | null | undefined): {
  center: GeoPoint;
  zoom: number;
} {
  const centroid = district ? DISTRICT_CENTROIDS[district] : undefined;
  return centroid
    ? { center: centroid, zoom: DISTRICT_ZOOM }
    : { center: SL_CENTER, zoom: SL_DEFAULT_ZOOM };
}

// OSM standard tiles (attribution required — every consumer renders the
// © OpenStreetMap credit). One URL constant so a future switch to
// MapTiler/self-hosted tiles is a one-line change; next.config.ts allows the
// host in img-src.
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_TILE_HOST = "https://tile.openstreetmap.org";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

// "View larger map" target on openstreetmap.org, pin marker included.
export function osmViewUrl(latitude: number, longitude: number, zoom = 15): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`;
}

// --- Slippy-map tile math (Web Mercator) -----------------------------------
// Standard OSM formulas: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
export const TILE_SIZE = 256;

// A lat/lng projected to global pixel coordinates at a zoom level.
export function latLngToWorldPixel(
  latitude: number,
  longitude: number,
  zoom: number
): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const latRad = (latitude * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * scale,
    y:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      scale,
  };
}

export function tileUrl(x: number, y: number, zoom: number): string {
  return OSM_TILE_URL.replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

// The 3×3 tile grid around a point, plus the point's pixel offset within that
// grid — everything the static mini-map needs to center the pin with pure
// CSS. 3×3 guarantees ≥ one full tile (256px) of coverage in every direction
// from the pin, which comfortably covers the mini-map viewport.
export function staticMapTiles(
  latitude: number,
  longitude: number,
  zoom: number
): {
  tiles: { url: string; col: number; row: number }[];
  // Pin position in grid pixels, measured from the grid's top-left corner.
  pinX: number;
  pinY: number;
} {
  const { x, y } = latLngToWorldPixel(latitude, longitude, zoom);
  const centerTileX = Math.floor(x / TILE_SIZE);
  const centerTileY = Math.floor(y / TILE_SIZE);
  const tiles: { url: string; col: number; row: number }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      tiles.push({
        url: tileUrl(centerTileX + col - 1, centerTileY + row - 1, zoom),
        col,
        row,
      });
    }
  }
  return {
    tiles,
    pinX: x - (centerTileX - 1) * TILE_SIZE,
    pinY: y - (centerTileY - 1) * TILE_SIZE,
  };
}
