// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import AdminDeleteButton from "./AdminDeleteButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en;
const fetchMock = vi.fn();

function renderButton(role: string) {
  return render(
    <ToastProvider>
      <AdminDeleteButton endpoint="/api/admin/providers/prov_1" role={role} />
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

describe("AdminDeleteButton", () => {
  it("DELETEs the resource and toasts success for a full admin", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderButton("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: t.admin.delete }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/providers/prov_1", {
      method: "DELETE",
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminDeleted);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("toasts an error when the request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderButton("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: t.admin.delete }));

    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminDeleteError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is disabled and inert for SUPPORT (no destructive access)", () => {
    renderButton("SUPPORT");
    const button = screen.getByRole("button", {
      name: t.admin.insufficientPermissions,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
