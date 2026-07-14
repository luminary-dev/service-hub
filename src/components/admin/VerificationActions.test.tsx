// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import VerificationActions from "./VerificationActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en;
const fetchMock = vi.fn();

function renderActions(role = "ADMIN") {
  return render(
    <ToastProvider>
      <VerificationActions providerId="prov_1" role={role} />
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

describe("VerificationActions", () => {
  it("approves a verification with a PATCH and toasts success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: t.admin.approve }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/verifications/prov_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminVerificationApproved);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("requires a second click to confirm a rejection and sends the reason", () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions();

    // First click only reveals the reason box — no request yet.
    fireEvent.click(screen.getByRole("button", { name: t.admin.reject }));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(t.admin.rejectionReasonPlaceholder), {
      target: { value: "Documents unreadable" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.admin.confirmReject }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/verifications/prov_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", reason: "Documents unreadable" }),
    });
  });

  it("toasts an error and does not refresh when approval fails", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: t.admin.approve }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.toast.adminVerificationApproveError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps both actions enabled for ADMIN", () => {
    renderActions("ADMIN");
    expect(
      (screen.getByRole("button", { name: t.admin.approve }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: t.admin.reject }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("disables both actions for SUPPORT with an explanatory title", () => {
    renderActions("SUPPORT");
    const approve = screen.getByRole("button", {
      name: t.admin.approve,
    }) as HTMLButtonElement;
    const reject = screen.getByRole("button", {
      name: t.admin.reject,
    }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
    expect(approve.title).toBe(t.admin.insufficientPermissions);
    expect(reject.title).toBe(t.admin.insufficientPermissions);
    fireEvent.click(approve);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
