// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "./ToastProvider";
import SecuritySettings from "./SecuritySettings";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const t = dict.en.security;
const fetchMock = vi.fn();

function renderSettings() {
  return render(
    <ToastProvider>
      <SecuritySettings />
    </ToastProvider>
  );
}

function findChangeForm() {
  // The change-password submit button lives in the first form.
  return screen
    .getByRole("button", { name: t.change })
    .closest("form") as HTMLFormElement;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("SecuritySettings — change password", () => {
  it("blocks submission and shows role=alert when the passwords differ", () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText(t.current), {
      target: { value: "oldpass1" },
    });
    fireEvent.change(screen.getByLabelText(t.newPassword), {
      target: { value: "newpass1" },
    });
    fireEvent.change(screen.getByLabelText(t.confirm), {
      target: { value: "different" },
    });
    fireEvent.submit(findChangeForm());

    expect(screen.getByRole("alert").textContent).toContain(t.mismatch);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a matching password change and toasts success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderSettings();
    fireEvent.change(screen.getByLabelText(t.current), {
      target: { value: "oldpass1" },
    });
    fireEvent.change(screen.getByLabelText(t.newPassword), {
      target: { value: "newpass1" },
    });
    fireEvent.change(screen.getByLabelText(t.confirm), {
      target: { value: "newpass1" },
    });
    fireEvent.submit(findChangeForm());

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "oldpass1",
        newPassword: "newpass1",
      }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.changed);
  });

  it("shows the server error via role=alert on a failed change", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Current password is wrong" }),
    });
    renderSettings();
    fireEvent.change(screen.getByLabelText(t.current), {
      target: { value: "oldpass1" },
    });
    fireEvent.change(screen.getByLabelText(t.newPassword), {
      target: { value: "newpass1" },
    });
    fireEvent.change(screen.getByLabelText(t.confirm), {
      target: { value: "newpass1" },
    });
    fireEvent.submit(findChangeForm());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Current password is wrong");
  });
});

describe("SecuritySettings — sign out everywhere", () => {
  it("posts to logout-all and toasts success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: t.logoutAll }));

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout-all", {
      method: "POST",
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.logoutAllDone);
  });
});

describe("SecuritySettings — delete account", () => {
  it("keeps the delete button disabled until a password is entered", () => {
    renderSettings();
    const button = screen.getByRole("button", {
      name: t.delete,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(t.deletePassword), {
      target: { value: "mypassword" },
    });
    expect(button.disabled).toBe(false);
  });

  it("posts the password and navigates home on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderSettings();
    fireEvent.change(screen.getByLabelText(t.deletePassword), {
      target: { value: "mypassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.delete }));

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "mypassword" }),
    });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("shows the server error via role=alert when deletion fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Password incorrect" }),
    });
    renderSettings();
    fireEvent.change(screen.getByLabelText(t.deletePassword), {
      target: { value: "mypassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.delete }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Password incorrect");
    expect(push).not.toHaveBeenCalled();
  });
});
