// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider, useToast } from "./ToastProvider";

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
    const toasts = screen.getAllByRole("status");
    expect(toasts).toHaveLength(2);
    expect(toasts[1].textContent).toContain("boom");
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
