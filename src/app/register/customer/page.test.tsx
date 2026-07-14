// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import CustomerRegisterPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const t = dict.en.custReg;
const fetchMock = vi.fn();

function fillAndSubmit(container: HTMLElement) {
  fireEvent.change(screen.getByLabelText(t.fullName), {
    target: { value: "Kasun Silva" },
  });
  fireEvent.change(screen.getByLabelText(t.email), {
    target: { value: "kasun@example.com" },
  });
  fireEvent.change(screen.getByLabelText(t.phone), {
    target: { value: "0771234567" },
  });
  fireEvent.change(screen.getByLabelText(t.password), {
    target: { value: "password123" },
  });
  // The consent tick (#62) is enforced by the JS validation (#378), not just
  // the native `required` attribute (which fireEvent.submit bypasses anyway).
  fireEvent.click(screen.getByRole("checkbox"));
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

describe("CustomerRegisterPage", () => {
  it("creates the account and routes to browse on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = render(<CustomerRegisterPage />);
    fillAndSubmit(container);

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/providers"));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.role).toBe("CUSTOMER");
  });

  // A dropped connection must not wedge the form (#363).
  it("recovers from a rejected fetch with an error and a re-enabled button", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<CustomerRegisterPage />);
    fillAndSubmit(container);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.failed);
    const button = screen.getByRole("button", {
      name: t.create,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
