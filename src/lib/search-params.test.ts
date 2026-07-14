import { describe, expect, it } from "vitest";
import {
  browseFilterParams,
  nearbySearchPath,
  type BrowseFilters,
} from "./search-params";

const emptyFilters: BrowseFilters = {
  q: "",
  category: "",
  district: "",
  priceMin: "",
  priceMax: "",
  ratingMin: "",
  availableOnly: false,
};

describe("browseFilterParams (#48)", () => {
  it("emits nothing for the empty filter set", () => {
    expect(browseFilterParams(emptyFilters).toString()).toBe("");
  });

  it("carries every active filter and skips inactive ones", () => {
    const params = browseFilterParams({
      q: "wiring",
      category: "electrician",
      district: "Colombo",
      priceMin: "1000",
      priceMax: "5000",
      ratingMin: "4",
      availableOnly: true,
    });
    expect(Object.fromEntries(params)).toEqual({
      q: "wiring",
      category: "electrician",
      district: "Colombo",
      priceMin: "1000",
      priceMax: "5000",
      ratingMin: "4",
      availableOnly: "1",
    });
  });

  it("URL-encodes free text (a Sinhala query survives the round trip)", () => {
    const params = browseFilterParams({ ...emptyFilters, q: "විදුලි වැඩ" });
    expect(new URLSearchParams(params.toString()).get("q")).toBe("විදුලි වැඩ");
  });
});

describe("nearbySearchPath (#48)", () => {
  it("targets /api/search/providers/nearby with center, radius and page size", () => {
    const path = nearbySearchPath(
      emptyFilters,
      { latitude: 6.9271, longitude: 79.8612 },
      25
    );
    const [pathname, qs] = path.split("?");
    expect(pathname).toBe("/api/search/providers/nearby");
    const params = new URLSearchParams(qs);
    expect(params.get("lat")).toBe("6.9271");
    expect(params.get("lng")).toBe("79.8612");
    expect(params.get("radiusKm")).toBe("25");
    // One page of pins — the service's MAX_PAGE_SIZE.
    expect(params.get("pageSize")).toBe("24");
  });

  it("keeps the active relational filters (district stays a service-area test)", () => {
    const path = nearbySearchPath(
      { ...emptyFilters, category: "plumber", district: "Kandy", availableOnly: true },
      { latitude: 7.2906, longitude: 80.6337 },
      10
    );
    const params = new URLSearchParams(path.split("?")[1]);
    expect(params.get("category")).toBe("plumber");
    expect(params.get("district")).toBe("Kandy");
    expect(params.get("availableOnly")).toBe("1");
    expect(params.get("radiusKm")).toBe("10");
  });
});
