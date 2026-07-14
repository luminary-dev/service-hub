// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { TOAST_DURATION_MS, ToastProvider, useToast } from "./ToastProvider";

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("saved!")}>ok</button>
      <button onClick={() => toast.error("boom")}>fail</button>
    </>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("shows a toast when the api is called", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("ok"));
    expect(screen.getByRole("status").textContent).toContain("saved!");
  });

  it("stacks multiple toasts", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("ok"));
    fireEvent.click(screen.getByText("fail"));
    // Success stays polite (role="status"); errors interrupt (role="alert").
    expect(screen.getByRole("status").textContent).toContain("saved!");
    expect(screen.getByRole("alert").textContent).toContain("boom");
  });

  it("announces error toasts assertively", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("fail"));
    const errorToast = screen.getByRole("alert");
    expect(errorToast.textContent).toContain("boom");
    // The error lives in the assertive live region, not the polite one.
    expect(errorToast.closest("[aria-live='assertive']")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("auto-dismisses after the toast duration", () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText("ok"));
    expect(screen.getByRole("status")).toBeTruthy();

    // Just before the 4s duration the toast is still up…
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByRole("status")).toBeTruthy();
    // …and gone right after.
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pauses auto-dismiss on hover and resumes on leave (#565)", () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText("ok"));
    const toast = screen.getByRole("status");

    // Hovering cancels the pending timer, so the toast outlives 4s…
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS + 1000));
    expect(screen.getByRole("status")).toBeTruthy();

    // …and leaving restarts the full duration.
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pauses auto-dismiss while the toast holds focus (#565)", () => {
    vi.useFakeTimers();
    renderWithProvider();
    fireEvent.click(screen.getByText("ok"));
    const dismissBtn = screen.getByRole("button", {
      name: dict.en.toast.dismiss,
    });

    fireEvent.focus(dismissBtn);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS + 1000));
    expect(screen.getByRole("status")).toBeTruthy();

    fireEvent.blur(dismissBtn);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears pending timers on unmount (#565)", () => {
    vi.useFakeTimers();
    const { unmount } = renderWithProvider();
    fireEvent.click(screen.getByText("ok"));
    unmount();
    // No timer should still be queued once the provider is gone.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dismisses immediately via the close button", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("ok"));
    fireEvent.click(
      screen.getByRole("button", { name: dict.en.toast.dismiss })
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("throws when useToast is used outside the provider", () => {
    // Silence React's error logging for the expected throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(
      "useToast must be used within <ToastProvider>"
    );
    spy.mockRestore();
  });
});
