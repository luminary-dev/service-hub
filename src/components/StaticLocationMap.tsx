// Static OSM mini-map for the public provider profile (#48, search &
// discovery RFC phase 1). No JavaScript: a 3×3 grid of standard OSM raster
// tiles (host allowed in next.config.ts img-src) is absolutely positioned so
// the provider's pin sits at the viewport center, with a CSS pin on top —
// clicking through opens the full map on openstreetmap.org. Renders on the
// server, costs the page no bundle weight, and keeps the mandatory
// OpenStreetMap attribution visible.
import {
  OSM_COPYRIGHT_URL,
  osmViewUrl,
  staticMapTiles,
  TILE_SIZE,
} from "@/lib/geo";

const MINI_MAP_ZOOM = 14;
const GRID = TILE_SIZE * 3;

export default function StaticLocationMap({
  latitude,
  longitude,
  alt,
  linkLabel,
}: {
  latitude: number;
  longitude: number;
  // Localized description of the map image region.
  alt: string;
  // Localized "View on OpenStreetMap" label.
  linkLabel: string;
}) {
  const { tiles, pinX, pinY } = staticMapTiles(latitude, longitude, MINI_MAP_ZOOM);

  return (
    <figure>
      <a
        href={osmViewUrl(latitude, longitude)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${alt} — ${linkLabel}`}
        className="relative block h-40 w-full max-w-md overflow-hidden rounded-sm border border-ink-300"
        data-testid="static-location-map"
      >
        {/* Tile canvas: the pin's grid position is translated to the viewport
            center. 3×3 tiles give ≥256px of coverage in every direction, more
            than the viewport ever shows. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2"
          style={{
            width: GRID,
            height: GRID,
            transform: `translate(-${pinX}px, -${pinY}px)`,
          }}
        >
          {tiles.map((tile) => (
            // Raster map tiles: next/image would re-proxy third-party tiles
            // through the app for zero benefit, so plain <img> is correct here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.url}
              src={tile.url}
              alt=""
              loading="lazy"
              decoding="async"
              width={TILE_SIZE}
              height={TILE_SIZE}
              className="absolute"
              style={{ left: tile.col * TILE_SIZE, top: tile.row * TILE_SIZE }}
            />
          ))}
        </span>
        {/* The pin, centered on the viewport. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="30"
            height="30"
          >
            <path
              fill="#1d4ed8"
              stroke="#ffffff"
              strokeWidth="1.2"
              d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z"
            />
            <circle cx="12" cy="9" r="2.6" fill="#ffffff" />
          </svg>
        </span>
      </a>
      {/* OSM tile usage requires visible attribution; kept outside the map
          link (nested links are invalid HTML). */}
      <figcaption className="mt-1 text-[10px] text-ink-400">
        ©{" "}
        <a
          href={OSM_COPYRIGHT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-ink-600"
        >
          OpenStreetMap
        </a>{" "}
        contributors
      </figcaption>
    </figure>
  );
}
