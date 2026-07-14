// @vitest-environment jsdom
//
// Map view orchestration tests (#48, search RFC phase 3) with the Leaflet
// half stubbed (ProviderMap.test.tsx covers it against a mocked leaflet):
// centering (district filter → centroid, near-me geolocation, denial
// fallback), the /api/search/providers/nearby fetch contract, the radius
// control, the a11y announcements and the marker→card selection handoff.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { DISTRICT_CENTROIDS } from "@/lib/geo";
import type { ProviderCardDTO } from "@/components/ProviderCard";
import { I18nProvider } from "./I18nProvider";
import type { BrowseFilters } from "@/lib/search-params";

// The stub surfaces the marker labels and an onSelect trigger, so tests can
// assert the map contract without Leaflet.
vi.mock("./ProviderMap", () => ({
  default: ({
    markers,
    mapLabel,
    onSelect,
  }: {
    markers: { id: string; label: string }[];
    mapLabel: string;
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="provider-map-stub" aria-label={mapLabel}>
      {markers.map((m) => (
        <button key={m.id} type="button" onClick={() => onSelect(m.id)}>
          {m.label}
        </button>
      ))}
    </div>
  ),
}));

import ProviderMapView from "./ProviderMapView";

const t = dict.en.browse;

const emptyFilters: BrowseFilters = {
  q: "",
  category: "",
  district: "",
  priceMin: "",
  priceMax: "",
  ratingMin: "",
  availableOnly: false,
};

function card(overrides: Partial<ProviderCardDTO>): ProviderCardDTO {
  return {
    id: "prov_1",
    userId: "user_1",
    name: "Sunil Perera",
    category: "electrician",
    categoryImageUrl: null,
    headline: "House wiring and repairs",
    district: "Colombo",
    city: "Nugegoda",
    experience: 8,
    available: true,
    awayUntil: null,
    verificationStatus: "VERIFIED",
    verifiedAt: "2025-06-01T00:00:00.000Z",
    createdAt: "2024-01-15T00:00:00.000Z",
    avatarUrl: null,
    coverPhoto: null,
    photos: [],
    services: [],
    fromPrice: null,
    fromPriceType: null,
    rating: 4.6,
    reviewCount: 12,
    latitude: 6.93,
    longitude: 79.87,
    distanceKm: 1.2,
    ...overrides,
  };
}

const fetchMock = vi.fn();
const getCurrentPosition = vi.fn();

function okResponse(providers: ProviderCardDTO[]) {
  return { ok: true, json: async () => ({ providers, total: providers.length }) };
}

function renderView(filters: Partial<BrowseFilters> = {}) {
  return render(
    <I18nProvider locale="en">
      <ProviderMapView filters={{ ...emptyFilters, ...filters }} />
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  getCurrentPosition.mockReset();
});

describe("ProviderMapView (#48)", () => {
  it("prompts for a center when there is no district filter (no fetch)", () => {
    renderView();
    expect(screen.getByText(t.mapPrompt)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("auto-centers on the filtered district's centroid and lists results with distances", async () => {
    fetchMock.mockResolvedValue(okResponse([card({})]));
    renderView({ district: "Kandy", category: "electrician" });

    await screen.findByText("Sunil Perera");
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/search/providers/nearby");
    expect(Number(url.searchParams.get("lat"))).toBeCloseTo(
      DISTRICT_CENTROIDS.Kandy.latitude
    );
    expect(Number(url.searchParams.get("lng"))).toBeCloseTo(
      DISTRICT_CENTROIDS.Kandy.longitude
    );
    expect(url.searchParams.get("radiusKm")).toBe("25");
    expect(url.searchParams.get("category")).toBe("electrician");
    expect(url.searchParams.get("district")).toBe("Kandy");

    // Distance renders on the card (geo-sorted results carry distanceKm)…
    expect(screen.getByText(dict.en.card.kmAway(1.2))).toBeTruthy();
    // …the marker carries the accessible "{name}, {category}, {km} km" label…
    expect(
      screen.getByRole("button", {
        name: t.markerLabel("Sunil Perera", "Electrician", 1.2),
      })
    ).toBeTruthy();
    // …and the result count is announced.
    expect(screen.getByRole("status").textContent).toBe(t.mapCount(1, 25));
    // The supplementary map can be skipped entirely.
    expect(screen.getByRole("link", { name: t.skipMap })).toBeTruthy();
  });

  it("centers on the geolocation fix when Near me succeeds", async () => {
    fetchMock.mockResolvedValue(okResponse([card({})]));
    getCurrentPosition.mockImplementation((onSuccess) =>
      onSuccess({ coords: { latitude: 6.05, longitude: 80.22 } })
    );
    renderView();

    fireEvent.click(screen.getByRole("button", { name: t.nearMe }));
    await screen.findByText("Sunil Perera");
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.searchParams.get("lat")).toBe("6.05");
    expect(url.searchParams.get("lng")).toBe("80.22");
  });

  it("falls back to the district picker when geolocation is denied", async () => {
    fetchMock.mockResolvedValue(okResponse([card({})]));
    getCurrentPosition.mockImplementation((_onSuccess, onError) =>
      onError({ code: 1 })
    );
    renderView();

    fireEvent.click(screen.getByRole("button", { name: t.nearMe }));
    // The denial is announced, not silently swallowed…
    expect((await screen.findByRole("status")).textContent).toBe(t.geoDenied);
    expect(fetchMock).not.toHaveBeenCalled();

    // …and choosing a district centers the map without location access.
    fireEvent.change(screen.getByLabelText(t.centerDistrict), {
      target: { value: "Galle" },
    });
    await screen.findByText("Sunil Perera");
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(Number(url.searchParams.get("lat"))).toBeCloseTo(
      DISTRICT_CENTROIDS.Galle.latitude
    );
  });

  it("refetches when the radius changes", async () => {
    fetchMock.mockResolvedValue(okResponse([card({})]));
    renderView({ district: "Colombo" });
    await screen.findByText("Sunil Perera");

    fireEvent.change(screen.getByLabelText(t.radiusLabel), {
      target: { value: "50" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = new URL(
      String(fetchMock.mock.calls[1][0]),
      "http://localhost"
    );
    expect(url.searchParams.get("radiusKm")).toBe("50");
  });

  it("shows the empty state when no pinned providers are in range", async () => {
    fetchMock.mockResolvedValue(okResponse([]));
    renderView({ district: "Jaffna" });
    await screen.findByText(t.mapEmptyTitle);
    expect(screen.getByText(t.mapEmptyBody)).toBeTruthy();
  });

  it("surfaces fetch failures as an alert with a retry", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce(okResponse([card({})]));
    renderView({ district: "Colombo" });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.mapError);
    fireEvent.click(screen.getByRole("button", { name: t.mapRetry }));
    await screen.findByText("Sunil Perera");
  });

  it("hands focus to the matching card when a marker is activated", async () => {
    fetchMock.mockResolvedValue(okResponse([card({})]));
    renderView({ district: "Colombo" });
    await screen.findByText("Sunil Perera");

    fireEvent.click(
      screen.getByRole("button", {
        name: t.markerLabel("Sunil Perera", "Electrician", 1.2),
      })
    );
    expect(document.activeElement?.id).toBe("map-card-prov_1");
  });

  it("keeps unpinned providers in the list without a marker", async () => {
    fetchMock.mockResolvedValue(
      okResponse([
        card({}),
        card({
          id: "prov_2",
          name: "Kamal Silva",
          latitude: undefined,
          longitude: undefined,
          distanceKm: undefined,
        }),
      ])
    );
    renderView({ district: "Colombo" });
    await screen.findByText("Kamal Silva");
    // Two cards, one marker: every map result is in the list, not vice versa.
    expect(
      screen.getAllByRole("button", { name: /, Electrician, / })
    ).toHaveLength(1);
  });
});
