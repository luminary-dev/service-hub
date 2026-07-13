// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import AdminJobTakedownButton from "./AdminJobTakedownButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en;
const fetchMock = vi.fn();

function renderButton(role: string, hidden = false) {
  return render(
    <ToastProvider>
      <AdminJobTakedownButton jobId="job_1" hidden={hidden} role={role} />
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

describe("AdminJobTakedownButton", () => {
  it("PATCHes { action: 'hide' } and toasts success for a full admin", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderButton("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: t.admin.jobHide }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/jobs/job_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hide" }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminJobHidden);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("PATCHes { action: 'unhide' } when the job is already hidden", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderButton("ADMIN", true);
    fireEvent.click(screen.getByRole("button", { name: t.admin.jobUnhide }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/jobs/job_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unhide" }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminJobRestored);
  });

  it("toasts an error when the request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderButton("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: t.admin.jobHide }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.toast.adminJobHideError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is disabled and inert for SUPPORT (takedown is destructive)", () => {
    renderButton("SUPPORT");
    const button = screen.getByRole("button", {
      name: t.admin.insufficientPermissions,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
