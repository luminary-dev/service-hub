// @vitest-environment jsdom
// Load-more paging for the dashboard inquiries tab (#372): the dashboard
// embeds page 1; the button pages through GET /api/provider/inquiries and
// appends, deduping by id.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import InquiriesList from "./InquiriesList";
import type { InquiryItem } from "./DashboardTabs";

const t = dict.en.dashboard.inquiries;
const fetchMock = vi.fn();

// InquiriesList toasts on failed status updates, so it needs the provider.
function renderList(props: React.ComponentProps<typeof InquiriesList>) {
  return render(
    <ToastProvider>
      <InquiriesList {...props} />
    </ToastProvider>
  );
}

function inquiry(id: string, overrides: Partial<InquiryItem> = {}): InquiryItem {
  return {
    id,
    name: `Customer ${id}`,
    phone: "0770000000",
    email: "",
    message: `Message ${id}`,
    status: "NEW",
    createdAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("InquiriesList load more", () => {
  it("hides the button when everything is already listed", () => {
    renderList({ initial: [inquiry("a")], total: 1 });
    expect(screen.queryByRole("button", { name: t.loadMore(0) })).toBeNull();
  });

  it("fetches the next page and appends without duplicates", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ inquiries: [inquiry("a"), inquiry("b")], total: 2 }),
    });
    renderList({ initial: [inquiry("a")], total: 2 });

    fireEvent.click(screen.getByRole("button", { name: t.loadMore(1) }));

    await waitFor(() => {
      expect(screen.getByText("Customer b")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider/inquiries?page=2&pageSize=20"
    );
    // "a" arrived again from the server page but is only rendered once.
    expect(screen.getAllByText("Customer a")).toHaveLength(1);
    // All rows listed → the button disappears.
    expect(screen.queryByRole("button", { name: t.loadingMore })).toBeNull();
  });

  it("shows an alert when the fetch fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    renderList({ initial: [inquiry("a")], total: 5 });

    fireEvent.click(screen.getByRole("button", { name: t.loadMore(4) }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(t.loadMoreError);
    });
  });
});
