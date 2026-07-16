// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "./ToastProvider";
import FavoriteButton from "./FavoriteButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => "/providers/prov_1",
}));

const fetchMock = vi.fn();

function renderFavorite(initialFavorited = false) {
  return render(
    <ToastProvider>
      <FavoriteButton providerId="prov_1" initialFavorited={initialFavorited} />
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

describe("FavoriteButton", () => {
  it("optimistically saves, POSTs, toasts and refreshes", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderFavorite(false);

    const button = screen.getByRole("button", { name: dict.en.card.save });
    fireEvent.click(button);

    // Optimistic: pressed before the request resolves.
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).toHaveBeenCalledWith("/api/favorites/prov_1", {
      method: "POST",
    });

    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(dict.en.toast.favAdded);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("unsaves with DELETE when already favorited", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderFavorite(true);

    fireEvent.click(screen.getByRole("button", { name: dict.en.card.saved }));

    expect(fetchMock).toHaveBeenCalledWith("/api/favorites/prov_1", {
      method: "DELETE",
    });
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(dict.en.toast.favRemoved);
  });

  it("reverts the optimistic state and toasts on a failed response", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderFavorite(false);

    const button = screen.getByRole("button", { name: dict.en.card.save });
    fireEvent.click(button);

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(dict.en.toast.favError);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reverts on a network error too", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    renderFavorite(false);

    const button = screen.getByRole("button", { name: dict.en.card.save });
    fireEvent.click(button);

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(dict.en.toast.favError);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("never navigates the wrapping card link", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderFavorite(false);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    screen
      .getByRole("button", { name: dict.en.card.save })
      .dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    await screen.findByRole("status");
  });
});
