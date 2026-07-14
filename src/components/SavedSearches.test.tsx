// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "./ToastProvider";
import SavedSearches, { SavedSearchItem } from "./SavedSearches";

const fetchMock = vi.fn();

const ITEMS: SavedSearchItem[] = [
  {
    id: "s1",
    name: "Electrician · Colombo",
    href: "/providers?category=electrician&district=Colombo",
    filters: "Electrician · Colombo",
  },
  {
    id: "s2",
    name: "Plumbers",
    href: "/providers?category=plumber",
    filters: "Plumber",
  },
];

function renderList(initial = ITEMS) {
  return render(
    <ToastProvider>
      <SavedSearches initial={initial} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("SavedSearches", () => {
  it("renders the empty state", () => {
    renderList([]);
    expect(screen.getByText(dict.en.account.searchesEmpty)).toBeTruthy();
  });

  it("links each search to its results", () => {
    renderList();
    const links = screen.getAllByRole("link", {
      name: dict.en.account.searchesView,
    });
    expect(links[0].getAttribute("href")).toBe(
      "/providers?category=electrician&district=Colombo"
    );
  });

  it("optimistically removes a search and DELETEs it", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderList();

    fireEvent.click(
      screen.getByRole("button", {
        name: `${dict.en.account.searchesDelete}: Plumbers`,
      })
    );
    expect(screen.queryByText("Plumbers")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/saved-searches/s2", {
      method: "DELETE",
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(dict.en.toast.searchRemoved);
  });

  it("restores the row and toasts on a failed delete", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderList();

    fireEvent.click(
      screen.getByRole("button", {
        name: `${dict.en.account.searchesDelete}: Plumbers`,
      })
    );
    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(dict.en.toast.searchRemoveError);
    expect(screen.getByText("Plumbers")).toBeTruthy();
  });
});
