// @vitest-environment jsdom
//
// Static mini-map tests (#48): the public profile's no-JS OSM tile grid.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import StaticLocationMap from "./StaticLocationMap";

afterEach(cleanup);

const props = {
  latitude: 6.9271,
  longitude: 79.8612,
  alt: "Map showing the approximate location of Nimal Perera",
  linkLabel: "View on OpenStreetMap",
};

describe("StaticLocationMap (#48)", () => {
  it("links the map to openstreetmap.org with an accessible name", () => {
    render(<StaticLocationMap {...props} />);
    const link = screen.getByRole("link", {
      name: `${props.alt} — ${props.linkLabel}`,
    });
    expect(link.getAttribute("href")).toContain("mlat=6.9271");
    expect(link.getAttribute("href")).toContain("mlon=79.8612");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders the 3×3 decorative tile grid from the OSM host", () => {
    const { container } = render(<StaticLocationMap {...props} />);
    const tiles = container.querySelectorAll("img");
    expect(tiles).toHaveLength(9);
    for (const img of tiles) {
      // Decorative — the figure link carries the accessible name.
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("src")).toMatch(
        /^https:\/\/tile\.openstreetmap\.org\//
      );
      expect(img.getAttribute("loading")).toBe("lazy");
    }
  });

  it("shows the mandatory OpenStreetMap attribution", () => {
    render(<StaticLocationMap {...props} />);
    const attribution = screen.getByRole("link", { name: "OpenStreetMap" });
    expect(attribution.getAttribute("href")).toBe(
      "https://www.openstreetmap.org/copyright"
    );
  });
});
