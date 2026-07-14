// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dict } from "@/lib/i18n";
import {
  NOTIFICATION_TYPES,
  notificationTypeLabel,
  type NotificationPreferenceDTO,
} from "@/lib/notifications";
import { I18nProvider } from "./I18nProvider";
import { ToastProvider } from "./ToastProvider";
import NotificationPreferences from "./NotificationPreferences";

const t = dict.en.notifications;

const fetchMock = vi.fn();

// The API's shape: the full catalog matrix, defaults merged over overrides.
const MATRIX: NotificationPreferenceDTO[] = NOTIFICATION_TYPES.map((type) => ({
  type,
  emailEnabled: type !== "NEW_JOB_MATCH", // one stored email override
  inAppEnabled: true,
}));

function renderPrefs(initial: NotificationPreferenceDTO[] | null = MATRIX) {
  return render(
    <I18nProvider locale="en">
      <ToastProvider>
        <NotificationPreferences initial={initial} />
      </ToastProvider>
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

describe("NotificationPreferences", () => {
  it("renders an email + in-app toggle for every catalog type", () => {
    renderPrefs();
    expect(screen.getAllByRole("checkbox")).toHaveLength(
      NOTIFICATION_TYPES.length * 2
    );
    for (const type of NOTIFICATION_TYPES) {
      const label = notificationTypeLabel(type, "en");
      expect(
        screen.getByRole("checkbox", { name: `${label} — ${t.prefsEmail}` })
      ).toBeTruthy();
      expect(
        screen.getByRole("checkbox", { name: `${label} — ${t.prefsInApp}` })
      ).toBeTruthy();
    }
  });

  it("reflects stored overrides", () => {
    renderPrefs();
    const jobEmail = screen.getByRole("checkbox", {
      name: `${notificationTypeLabel("NEW_JOB_MATCH", "en")} — ${t.prefsEmail}`,
    }) as HTMLInputElement;
    expect(jobEmail.checked).toBe(false);
  });

  it("POSTs a single-channel override on toggle", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderPrefs();
    const box = screen.getByRole("checkbox", {
      name: `${notificationTypeLabel("NEW_REVIEW", "en")} — ${t.prefsEmail}`,
    }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(false); // optimistic
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/notification-preferences");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "NEW_REVIEW",
      emailEnabled: false,
    });
  });

  it("reverts the toggle and alerts when the save fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPrefs();
    const box = screen.getByRole("checkbox", {
      name: `${notificationTypeLabel("NEW_INQUIRY", "en")} — ${t.prefsInApp}`,
    }) as HTMLInputElement;
    fireEvent.click(box);
    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.prefsError);
    expect(box.checked).toBe(true); // reverted
  });

  it("shows the load-error line when the matrix could not be fetched", () => {
    renderPrefs(null);
    expect(screen.getByText(t.prefsLoadError)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
