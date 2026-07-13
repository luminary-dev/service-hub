// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import InquiryForm from "./InquiryForm";

const t = dict.en.inquiry;
const fetchMock = vi.fn();

function renderForm() {
  return render(
    <InquiryForm providerId="prov_1" providerName="Sunil Perera" defaultName="Kasun" />
  );
}

// Fills every required field so the native constraints are satisfied and the
// submit handler is the thing under test.
function fillRequired() {
  fireEvent.change(screen.getByLabelText(t.name), { target: { value: "Kasun" } });
  fireEvent.change(screen.getByLabelText(t.phone), {
    target: { value: "0771234567" },
  });
  fireEvent.change(screen.getByLabelText(t.message), {
    target: { value: "Please rewire my kitchen." },
  });
}

function submit(container: HTMLElement) {
  fireEvent.submit(container.querySelector("form")!);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("InquiryForm", () => {
  it("marks the name, phone and message fields required with min lengths", () => {
    renderForm();
    const name = screen.getByLabelText(t.name) as HTMLInputElement;
    const phone = screen.getByLabelText(t.phone) as HTMLInputElement;
    const message = screen.getByLabelText(t.message) as HTMLTextAreaElement;
    expect(name.required).toBe(true);
    expect(name.minLength).toBe(2);
    expect(phone.required).toBe(true);
    expect(phone.minLength).toBe(9);
    expect(message.required).toBe(true);
    expect(message.minLength).toBe(10);
  });

  it("renders an inert, accessibility-hidden honeypot field (#65)", () => {
    const { container } = renderForm();
    const honeypot = container.querySelector<HTMLInputElement>("#inquiry-company")!;
    // Present in the DOM for bots to fill...
    expect(honeypot).toBeTruthy();
    expect(honeypot.name).toBe("company");
    // ...but inert for real users: not keyboard-reachable, never prefilled, and
    // hidden from the accessibility tree via an aria-hidden ancestor.
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.getAttribute("autocomplete")).toBe("off");
    expect(honeypot.closest("[aria-hidden='true']")).toBeTruthy();
  });

  it("sends whatever a bot writes into the honeypot so the server can filter it (#65)", () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = renderForm();
    fillRequired();
    // Simulate a bot writing the DOM value directly (no React event fired).
    const honeypot = container.querySelector<HTMLInputElement>("#inquiry-company")!;
    honeypot.value = "spam";
    submit(container);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.company).toBe("spam");
  });

  it("submits the inquiry and shows the sent confirmation on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = renderForm();
    fillRequired();
    submit(container);

    expect(fetchMock).toHaveBeenCalledWith("/api/providers/prov_1/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Kasun",
        phone: "0771234567",
        email: "",
        message: "Please rewire my kitchen.",
        company: "",
      }),
    });

    // The confirmation is an announced live region (#510)...
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(t.sentTitle);
    // ...whose heading grabs focus so keyboard users aren't dropped on <body>.
    const heading = screen.getByText(t.sentTitle);
    // Focus moves in a useEffect — wait for it to flush (avoids a coverage-run flake).
    await waitFor(() => expect(document.activeElement).toBe(heading));
    // The form (and its submit button) is replaced by the confirmation.
    expect(screen.queryByRole("button", { name: t.send })).toBeNull();
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = renderForm();
    fillRequired();
    submit(container);

    const button = screen.getByRole("button", { name: t.sending });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    resolve({ ok: true, json: async () => ({}) });
    await screen.findByText(t.sentTitle);
  });

  it("surfaces the server error via role=alert and keeps the form mounted", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Phone number looks invalid" }),
    });
    const { container } = renderForm();
    fillRequired();
    submit(container);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Phone number looks invalid");
    expect(screen.getByRole("button", { name: t.send })).toBeTruthy();
  });

  it("falls back to a generic error when the response has no message", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const { container } = renderForm();
    fillRequired();
    submit(container);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.error);
  });
});
