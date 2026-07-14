// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dict } from "@/lib/i18n";
import type { NotificationDTO } from "@/lib/notifications";
import { I18nProvider } from "./I18nProvider";
import NotificationBell from "./NotificationBell";

const t = dict.en.notifications;

const fetchMock = vi.fn();

const ITEMS: NotificationDTO[] = [
  {
    id: "ntf_1",
    type: "NEW_INQUIRY",
    payload: { customerName: "Kasun" },
    link: "/dashboard?tab=inquiries",
    readAt: null,
    createdAt: "2026-07-01T09:00:00.000Z",
  },
  {
    id: "ntf_2",
    type: "NEW_REVIEW",
    payload: { reviewerName: "Dilani", rating: 4 },
    link: "/providers/prov_1",
    readAt: "2026-06-30T10:00:00.000Z",
    createdAt: "2026-06-30T09:00:00.000Z",
  },
];

// Routes the bell's three endpoints; per-endpoint overrides simulate outages.
function mockApi({
  count = 2,
  items = ITEMS,
  countOk = true,
  feedOk = true,
}: {
  count?: number;
  items?: NotificationDTO[];
  countOk?: boolean;
  feedOk?: boolean;
} = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith("/api/notifications/unread-count")) {
      return Promise.resolve(
        countOk
          ? { ok: true, json: async () => ({ count }) }
          : { ok: false, json: async () => ({}) }
      );
    }
    if (url.startsWith("/api/notifications/read")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve(
      feedOk
        ? {
            ok: true,
            json: async () => ({ notifications: items, nextCursor: null }),
          }
        : { ok: false, json: async () => ({}) }
    );
  });
}

function countCalls() {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith("/api/notifications/unread-count")
  ).length;
}

function readCalls() {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith("/api/notifications/read")
  );
}

function renderBell(locale: "en" | "si" = "en") {
  return render(
    <I18nProvider locale={locale}>
      <NotificationBell />
    </I18nProvider>
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

describe("NotificationBell", () => {
  it("stays hidden while the count endpoint is unreachable", async () => {
    mockApi({ countOk: false });
    const { container } = renderBell();
    await waitFor(() => expect(countCalls()).toBe(1));
    expect(container.querySelector("button")).toBeNull();
  });

  it("announces the unread count on the trigger and a status region", async () => {
    mockApi({ count: 3 });
    renderBell();
    const trigger = await screen.findByRole("button", {
      name: t.bellUnread(3),
    });
    expect(trigger.textContent).toContain("3");
    expect(screen.getByRole("status").textContent).toBe(t.unreadStatus(3));
  });

  it("caps the visual badge at 99+", async () => {
    mockApi({ count: 120 });
    renderBell();
    const trigger = await screen.findByRole("button", {
      name: t.bellUnread(120),
    });
    expect(trigger.textContent).toContain("99+");
  });

  it("shows a plain bell (no badge) at zero unread", async () => {
    mockApi({ count: 0, items: [] });
    renderBell();
    const trigger = await screen.findByRole("button", { name: t.bell });
    expect(trigger.textContent).not.toContain("0");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("opens with recent notifications and marks the unread ones read", async () => {
    mockApi({ count: 1 });
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: t.bellUnread(1) }));

    // Sentences are rendered from type + payload at read time.
    const en = dict.en.notifications.render;
    expect(
      await screen.findByText(en.NEW_INQUIRY({ customerName: "Kasun" }))
    ).toBeTruthy();
    expect(
      screen.getByText(en.NEW_REVIEW({ reviewerName: "Dilani", rating: 4 }))
    ).toBeTruthy();

    // Only the unread row is in the mark-read write…
    await waitFor(() => expect(readCalls()).toHaveLength(1));
    expect(JSON.parse(readCalls()[0][1].body as string)).toEqual({
      ids: ["ntf_1"],
    });
    // …and the badge drops once it is confirmed.
    await screen.findByRole("button", { name: t.bell });
  });

  it("skips the mark-read write when everything shown is already read", async () => {
    mockApi({ count: 0, items: [ITEMS[1]] });
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: t.bell }));
    await screen.findByText(
      dict.en.notifications.render.NEW_REVIEW({
        reviewerName: "Dilani",
        rating: 4,
      })
    );
    expect(readCalls()).toHaveLength(0);
  });

  it("shows the dropdown error state when the feed fetch fails", async () => {
    mockApi({ count: 1, feedOk: false });
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: t.bellUnread(1) }));
    expect(await screen.findByText(t.loadError)).toBeTruthy();
    expect(readCalls()).toHaveLength(0);
  });

  it("localizes the view-all and notification links under /si (#364)", async () => {
    mockApi({ count: 1 });
    renderBell("si");
    const si = dict.si.notifications;
    fireEvent.click(
      await screen.findByRole("button", { name: si.bellUnread(1) })
    );
    const viewAll = await screen.findByRole("link", { name: si.viewAll });
    expect(viewAll.getAttribute("href")).toBe("/si/account/notifications");
    const item = screen.getByRole("link", {
      name: new RegExp("Kasun"),
    });
    expect(item.getAttribute("href")).toBe("/si/dashboard?tab=inquiries");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    mockApi({ count: 1 });
    renderBell();
    const trigger = await screen.findByRole("button", {
      name: t.bellUnread(1),
    });
    fireEvent.click(trigger);
    const list = await screen.findByRole("link", { name: t.viewAll });
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.queryByRole("link", { name: t.viewAll })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("refreshes the count when the window regains focus", async () => {
    mockApi({ count: 1 });
    renderBell();
    await waitFor(() => expect(countCalls()).toBe(1));
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(countCalls()).toBe(2));
  });

  it("slow-polls the count every 60s while the tab is visible", async () => {
    vi.useFakeTimers();
    try {
      mockApi({ count: 1 });
      renderBell();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(countCalls()).toBe(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(countCalls()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
