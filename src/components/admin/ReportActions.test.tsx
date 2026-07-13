// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import ReportActions from "./ReportActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en;
const fetchMock = vi.fn();

function renderActions(role: string) {
  return render(
    <ToastProvider>
      <ReportActions endpoint="/api/admin/reports/rep_1" role={role} />
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
  refresh.mockReset();
});

describe("ReportActions", () => {
  it("resolves a report (allowed for SUPPORT) with a PATCH", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions("SUPPORT");
    fireEvent.click(screen.getByRole("button", { name: t.admin.resolve }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/reports/rep_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RESOLVED" }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminReportResolved);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("dismisses a report with the DISMISSED status", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: t.admin.dismissReport }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/reports/rep_1",
      expect.objectContaining({ body: JSON.stringify({ status: "DISMISSED" }) })
    );
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminReportDismissed);
  });

  it("toasts an error and does not refresh on failure", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderActions("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: t.admin.resolve }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.toast.adminReportResolveError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables the actions for a non-admin role", () => {
    renderActions("CUSTOMER");
    expect(
      (screen.getByRole("button", { name: t.admin.resolve }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: t.admin.resolve }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
