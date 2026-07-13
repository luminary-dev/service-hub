// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import LoginPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const t = dict.en.login;
const fetchMock = vi.fn();

function fillAndSubmit(container: HTMLElement) {
  fireEvent.change(screen.getByLabelText(t.email), {
    target: { value: "kasun@example.com" },
  });
  fireEvent.change(screen.getByLabelText(t.password), {
    target: { value: "password123" },
  });
  fireEvent.submit(container.querySelector("form")!);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  push.mockReset();
});

describe("LoginPage", () => {
  it("signs in and routes by role on success", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { role: "CUSTOMER" } }),
    });
    const { container } = render(<LoginPage />);
    fillAndSubmit(container);

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/providers"));
  });

  // A dropped connection must not wedge the form (#363): the error is
  // announced and the submit button is enabled for a retry.
  it("recovers from a rejected fetch with an error and a re-enabled button", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<LoginPage />);
    fillAndSubmit(container);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.failed);
    const button = screen.getByRole("button", {
      name: t.signIn,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
