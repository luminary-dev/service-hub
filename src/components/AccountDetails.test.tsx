// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "./ToastProvider";
import AccountDetails from "./AccountDetails";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const t = dict.en.account;
const fetchMock = vi.fn();

const BASE = {
  name: "Test User",
  phone: "0771234567",
  email: "old@baas.lk",
  emailVerified: true,
  avatarUrl: null,
};

function renderDetails(hasPassword = true) {
  return render(
    <ToastProvider>
      <AccountDetails initial={{ ...BASE, hasPassword }} />
    </ToastProvider>
  );
}

function findEmailForm() {
  return screen
    .getByRole("button", { name: t.changeEmail })
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

describe("AccountDetails — profile", () => {
  it("puts the edited name/phone and toasts success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderDetails();
    fireEvent.change(screen.getByLabelText(t.nameLabel), {
      target: { value: "New Name" },
    });
    fireEvent.change(screen.getByLabelText(t.phoneLabel), {
      target: { value: "0719876543" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: t.saveProfile })
        .closest("form") as HTMLFormElement
    );

    expect(fetchMock).toHaveBeenCalledWith("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name", phone: "0719876543" }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(t.profileSaved);
  });
});

describe("AccountDetails — change email", () => {
  // #504 regression: password accounts must send the current password with the
  // change request or the backend rejects it, so the form has to collect it.
  it("sends the confirmed password alongside the new address for a password account", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderDetails(true);
    fireEvent.change(screen.getByLabelText(t.emailNew), {
      target: { value: "new@baas.lk" },
    });
    fireEvent.change(screen.getByLabelText(t.emailPassword), {
      target: { value: "current-pw-123" },
    });
    fireEvent.submit(findEmailForm());

    expect(fetchMock).toHaveBeenCalledWith("/api/account/email/change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@baas.lk",
        password: "current-pw-123",
      }),
    });
    const sent = await screen.findByRole("status");
    expect(sent.textContent).toContain(t.emailChangeSent("new@baas.lk"));
  });

  it("keeps the submit disabled until both address and password are entered", () => {
    renderDetails(true);
    const button = screen.getByRole("button", {
      name: t.changeEmail,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(t.emailNew), {
      target: { value: "new@baas.lk" },
    });
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(t.emailPassword), {
      target: { value: "current-pw-123" },
    });
    expect(button.disabled).toBe(false);
  });

  // Social-only accounts (#398) have no password; the session is the re-auth,
  // so the field is hidden and the body carries only the address.
  it("hides the password field and posts only the address for a social-only account", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderDetails(false);
    expect(screen.queryByLabelText(t.emailPassword)).toBeNull();

    fireEvent.change(screen.getByLabelText(t.emailNew), {
      target: { value: "new@baas.lk" },
    });
    fireEvent.submit(findEmailForm());

    expect(fetchMock).toHaveBeenCalledWith("/api/account/email/change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@baas.lk" }),
    });
    await screen.findByRole("status");
  });

  it("shows the server error via role=alert on a rejected change", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Incorrect password." }),
    });
    renderDetails(true);
    fireEvent.change(screen.getByLabelText(t.emailNew), {
      target: { value: "new@baas.lk" },
    });
    fireEvent.change(screen.getByLabelText(t.emailPassword), {
      target: { value: "wrong" },
    });
    fireEvent.submit(findEmailForm());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Incorrect password.");
  });
});
