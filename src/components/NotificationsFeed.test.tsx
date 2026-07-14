// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dict } from "@/lib/i18n";
import type { NotificationDTO } from "@/lib/notifications";
import { I18nProvider } from "./I18nProvider";
import { ToastProvider } from "./ToastProvider";
import NotificationsFeed from "./NotificationsFeed";

const t = dict.en.notifications;

const fetchMock = vi.fn();

const ITEMS: NotificationDTO[] = [
  {
    id: "ntf_1",
    type: "JOB_RESPONSE",
    payload: { providerName: "Sunil", jobTitle: "Fix a leak" },
    link: "/jobs/mine",
    readAt: null,
    createdAt: "2026-07-01T09:00:00.000Z",
  },
  {
    id: "ntf_2",
    type: "VERIFICATION_APPROVED",
    payload: {},
    link: "/dashboard",
    readAt: "2026-06-30T10:00:00.000Z",
    createdAt: "2026-06-30T09:00:00.000Z",
  },
];

function renderFeed(
  initial: NotificationDTO[] = ITEMS,
  cursor: string | null = null,
  locale: "en" | "si" = "en"
) {
  return render(
    <I18nProvider locale={locale}>
      <ToastProvider>
        <NotificationsFeed initial={initial} initialCursor={cursor} />
      </ToastProvider>
    </I18nProvider>
  );
}

function readCalls() {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith("/api/notifications/read")
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

describe("NotificationsFeed", () => {
  it("renders the empty state", () => {
    renderFeed([]);
    expect(screen.getByText(t.feedEmpty)).toBeTruthy();
    expect(screen.getByText(t.feedEmptyBody)).toBeTruthy();
  });

  it("renders sentences from type + payload and flags unread rows", () => {
    renderFeed();
    expect(
      screen.getByText(
        t.render.JOB_RESPONSE({ providerName: "Sunil", jobTitle: "Fix a leak" })
      )
    ).toBeTruthy();
    // Exactly one row (ntf_1) carries the screen-reader unread marker.
    expect(screen.getAllByText(`${t.unread}:`)).toHaveLength(1);
  });

  it("re-renders the whole feed in Sinhala under the si locale", () => {
    renderFeed(ITEMS, null, "si");
    expect(
      screen.getByText(
        dict.si.notifications.render.JOB_RESPONSE({
          providerName: "Sunil",
          jobTitle: "Fix a leak",
        })
      )
    ).toBeTruthy();
    // Row links keep the /si prefix (#364).
    const link = screen.getAllByRole("link")[0];
    expect(link.getAttribute("href")).toBe("/si/jobs/mine");
  });

  it("marks everything read via { all: true } and announces it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    renderFeed();
    fireEvent.click(screen.getByRole("button", { name: t.markAllRead }));

    await waitFor(() => expect(readCalls()).toHaveLength(1));
    expect(JSON.parse(readCalls()[0][1].body as string)).toEqual({ all: true });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.allRead);
    // The unread marker is gone and the button is now disabled.
    expect(screen.queryByText(`${t.unread}:`)).toBeNull();
    expect(
      (screen.getByRole("button", { name: t.markAllRead }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("keeps rows unread and alerts when mark-all fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderFeed();
    fireEvent.click(screen.getByRole("button", { name: t.markAllRead }));
    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.markError);
    expect(screen.getAllByText(`${t.unread}:`)).toHaveLength(1);
  });

  it("disables mark-all when there is nothing unread", () => {
    renderFeed([ITEMS[1]]);
    expect(
      (screen.getByRole("button", { name: t.markAllRead }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("pages older rows through the cursor and stops at the end", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: "ntf_3",
            type: "NEW_REVIEW",
            payload: { reviewerName: "Kasun", rating: 5 },
            link: "/providers/prov_1",
            readAt: "2026-06-01T00:00:00.000Z",
            createdAt: "2026-05-30T09:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    });
    renderFeed(ITEMS, "ntf_2");

    const more = screen.getByRole("button", { name: t.loadMore });
    fireEvent.click(more);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications?take=20&cursor=ntf_2",
      { cache: "no-store" }
    );
    expect(
      await screen.findByText(
        t.render.NEW_REVIEW({ reviewerName: "Kasun", rating: 5 })
      )
    ).toBeTruthy();
    // nextCursor null → the pager disappears.
    expect(screen.queryByRole("button", { name: t.loadMore })).toBeNull();
  });

  it("marks a row read when its link is followed", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    renderFeed();
    const link = screen
      .getAllByRole("link")
      .find((l) => l.getAttribute("href") === "/jobs/mine")!;
    fireEvent.click(link);
    await waitFor(() => expect(readCalls()).toHaveLength(1));
    expect(JSON.parse(readCalls()[0][1].body as string)).toEqual({
      ids: ["ntf_1"],
    });
    expect(screen.queryByText(`${t.unread}:`)).toBeNull();
  });
});
