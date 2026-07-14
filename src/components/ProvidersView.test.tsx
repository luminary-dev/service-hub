// @vitest-environment jsdom
//
// List/map toggle tests (#48, search RFC phase 3): the server-rendered list
// stays the default view, the toggle is an aria-pressed button group, and the
// map view mounts only on demand (it's progressive enhancement, so nothing
// map-related should render — or fetch — while the list is showing).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { I18nProvider } from "./I18nProvider";
import type { BrowseFilters } from "@/lib/search-params";

vi.mock("./ProviderMapView", () => ({
  default: ({ filters }: { filters: BrowseFilters }) => (
    <div data-testid="map-view-stub">map for {filters.district || "all"}</div>
  ),
}));

import ProvidersView from "./ProvidersView";

const t = dict.en.browse;

const filters: BrowseFilters = {
  q: "",
  category: "",
  district: "Kandy",
  priceMin: "",
  priceMax: "",
  ratingMin: "",
  availableOnly: false,
};

function renderView() {
  return render(
    <I18nProvider locale="en">
      <ProvidersView filters={filters}>
        <div data-testid="list-view">the list</div>
      </ProvidersView>
    </I18nProvider>
  );
}

afterEach(cleanup);

describe("ProvidersView (#48)", () => {
  it("shows the list by default and never mounts the map", () => {
    renderView();
    expect(screen.getByTestId("list-view")).toBeTruthy();
    expect(screen.queryByTestId("map-view-stub")).toBeNull();
    const group = screen.getByRole("group", { name: t.viewLabel });
    expect(group).toBeTruthy();
    expect(
      screen.getByRole("button", { name: t.viewList }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: t.viewMap }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("toggles to the map view (with the active filters) and back", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: t.viewMap }));
    expect(screen.getByTestId("map-view-stub").textContent).toBe("map for Kandy");
    expect(screen.queryByTestId("list-view")).toBeNull();
    expect(
      screen.getByRole("button", { name: t.viewMap }).getAttribute("aria-pressed")
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: t.viewList }));
    expect(screen.getByTestId("list-view")).toBeTruthy();
    expect(screen.queryByTestId("map-view-stub")).toBeNull();
  });
});
