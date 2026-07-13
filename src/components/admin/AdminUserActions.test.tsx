// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import AdminUserActions from "./AdminUserActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en;
const fetchMock = vi.fn();

function renderActions(
  props: Partial<React.ComponentProps<typeof AdminUserActions>> = {}
) {
  return render(
    <ToastProvider>
      <AdminUserActions
        userId="user_1"
        role="CUSTOMER"
        locked={false}
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

describe("AdminUserActions", () => {
  it("does not PATCH when the select changes — only on explicit apply", () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions();
    fireEvent.change(screen.getByLabelText(t.admin.usersRole), {
      target: { value: "PROVIDER" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables the apply button while the selection matches the current role", () => {
    renderActions();
    const apply = screen.getByRole("button", {
      name: t.admin.applyRole,
    }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(t.admin.usersRole), {
      target: { value: "ADMIN" },
    });
    expect(apply.disabled).toBe(false);
  });

  it("PATCHes the staged role on apply and toasts on success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions();
    fireEvent.change(screen.getByLabelText(t.admin.usersRole), {
      target: { value: "PROVIDER" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.admin.applyRole }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/user_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "PROVIDER" }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminRoleChanged);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("surfaces the server error message on a failed role change", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Cannot modify your own account here" }),
    });
    renderActions();
    fireEvent.change(screen.getByLabelText(t.admin.usersRole), {
      target: { value: "ADMIN" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.admin.applyRole }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain("Cannot modify your own account here");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("falls back to the generic error toast when the failure has no body", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    renderActions();
    fireEvent.change(screen.getByLabelText(t.admin.usersRole), {
      target: { value: "SUPPORT" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.admin.applyRole }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.toast.adminRoleChangeError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("locks an unlocked account and unlocks a locked one, toasting each", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { rerender } = renderActions({ locked: false });
    fireEvent.click(screen.getByRole("button", { name: t.admin.lock }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/users/user_1",
      expect.objectContaining({ body: JSON.stringify({ action: "lock" }) })
    );
    // The controls disable while pending; wait for the first request to settle.
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(
      (await screen.findByRole("status")).textContent
    ).toContain(t.toast.adminUserLocked);

    rerender(
      <ToastProvider>
        <AdminUserActions userId="user_1" role="CUSTOMER" locked />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: t.admin.unlock }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/users/user_1",
      expect.objectContaining({ body: JSON.stringify({ action: "unlock" }) })
    );
  });

  it("toasts an error when a lock fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: t.admin.lock }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.toast.adminUserLockError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("posts to the force-logout endpoint and toasts on success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: t.admin.forceLogout }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/user_1/force-logout",
      { method: "POST" }
    );
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.toast.adminForceLogout);
  });

  it("toasts an error when force-logout fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: t.admin.forceLogout }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.toast.adminForceLogoutError);
    expect(refresh).not.toHaveBeenCalled();
  });
});
