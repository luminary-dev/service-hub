// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "./ToastProvider";
import SaveSearchButton from "./SaveSearchButton";

const fetchMock = vi.fn();

function renderButton() {
  return render(
    <ToastProvider>
      <SaveSearchButton
        query="wiring"
        category="electrician"
        district="Colombo"
        defaultName="Electrician · Colombo"
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
});

describe("SaveSearchButton", () => {
  it("expands into a prefilled name form and POSTs the filters", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 });
    renderButton();

    fireEvent.click(
      screen.getByRole("button", { name: dict.en.browse.saveSearch })
    );
    const input = screen.getByLabelText(dict.en.browse.saveSearchNameLabel);
    expect((input as HTMLInputElement).value).toBe("Electrician · Colombo");

    fireEvent.click(
      screen.getByRole("button", { name: dict.en.browse.saveSearchSave })
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Electrician · Colombo",
        query: "wiring",
        category: "electrician",
        district: "Colombo",
      }),
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(dict.en.toast.searchSaved);
    // The form collapses back to the affordance after a successful save.
    expect(
      screen.getByRole("button", { name: dict.en.browse.saveSearch })
    ).toBeTruthy();
  });

  it("shows the limit message on a 429", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    renderButton();

    fireEvent.click(
      screen.getByRole("button", { name: dict.en.browse.saveSearch })
    );
    fireEvent.click(
      screen.getByRole("button", { name: dict.en.browse.saveSearchSave })
    );

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(dict.en.toast.searchLimit);
  });

  it("toasts the generic error on failure and keeps the form open", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    renderButton();

    fireEvent.click(
      screen.getByRole("button", { name: dict.en.browse.saveSearch })
    );
    fireEvent.click(
      screen.getByRole("button", { name: dict.en.browse.saveSearchSave })
    );

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(dict.en.toast.searchSaveError);
    expect(screen.getByLabelText(dict.en.browse.saveSearchNameLabel)).toBeTruthy();
  });
});
