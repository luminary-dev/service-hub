// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import AdminProviderActions from "./AdminProviderActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en;
const fetchMock = vi.fn();

function renderActions(
  props: Partial<React.ComponentProps<typeof AdminProviderActions>> = {}
) {
  return render(
    <ToastProvider>
      <AdminProviderActions
        providerId="prov_1"
        verified={false}
        suspended={false}
        role="ADMIN"
        {...props}
      />
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

describe("AdminProviderActions", () => {
  it("PATCHes the verify action and toasts on success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: t.admin.verify }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/providers/prov_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify" }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminVerified);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("sends the inverse action when already verified / suspended", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions({ verified: true, suspended: true });

    fireEvent.click(screen.getByRole("button", { name: t.admin.unverify }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/providers/prov_1",
      expect.objectContaining({ body: JSON.stringify({ action: "unverify" }) })
    );
    // The buttons disable while pending; wait for the first request to settle.
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: t.admin.unsuspend }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/providers/prov_1",
      expect.objectContaining({ body: JSON.stringify({ action: "unsuspend" }) })
    );
  });

  it("toasts an error and does not refresh on failure", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: t.admin.suspend }));

    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminSuspendError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables both actions for SUPPORT", () => {
    renderActions({ role: "SUPPORT" });
    expect(
      (screen.getByRole("button", { name: t.admin.verify }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: t.admin.suspend }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: t.admin.verify }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
