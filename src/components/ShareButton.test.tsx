// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "./ToastProvider";
import ShareButton from "./ShareButton";

// jsdom ships neither navigator.share nor navigator.clipboard; each test
// installs exactly what its scenario needs.
function stubNavigator(name: "share" | "clipboard", value: unknown) {
  Object.defineProperty(window.navigator, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function renderShare() {
  return render(
    <ToastProvider>
      <ShareButton title="Nuwan Perera — Mechanic" />
    </ToastProvider>
  );
}

const shareLabel = dict.en.profile.share;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // @ts-expect-error test-only cleanup of stubbed navigator APIs
  delete window.navigator.share;
  // @ts-expect-error test-only cleanup of stubbed navigator APIs
  delete window.navigator.clipboard;
});

describe("ShareButton", () => {
  it("prefers the native share sheet when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    stubNavigator("share", share);
    stubNavigator("clipboard", { writeText });

    renderShare();
    fireEvent.click(screen.getByRole("button", { name: shareLabel }));

    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share).toHaveBeenCalledWith({
      title: "Nuwan Perera — Mechanic",
      url: window.location.href,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull(); // no toast on native share
  });

  it("copies the link and confirms with a toast when share is unsupported", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator("clipboard", { writeText });

    renderShare();
    fireEvent.click(screen.getByRole("button", { name: shareLabel }));

    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(dict.en.profile.shareCopied);
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it("shows an error toast when the clipboard write fails", async () => {
    stubNavigator("clipboard", {
      writeText: vi.fn().mockRejectedValue(new Error("denied")),
    });

    renderShare();
    fireEvent.click(screen.getByRole("button", { name: shareLabel }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(dict.en.profile.shareError);
  });

  it("stays silent when the user dismisses the native share sheet", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("dismissed", "AbortError"));
    const writeText = vi.fn();
    stubNavigator("share", share);
    stubNavigator("clipboard", { writeText });

    renderShare();
    fireEvent.click(screen.getByRole("button", { name: shareLabel }));

    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
