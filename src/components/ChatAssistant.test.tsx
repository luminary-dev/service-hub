// @vitest-environment jsdom
//
// ChatAssistant consumes a Server-Sent-Events stream on the happy path. The
// streaming read loop (ReadableStream reader + TextDecoder) is not meaningfully
// reproducible in jsdom, so the successful-response path is exercised in the
// e2e/browser layer, not here. These tests cover the tractable client
// behaviour: launcher toggle + focus, empty-draft guard, and the failure alert.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import ChatAssistant from "./ChatAssistant";

const t = dict.en.assistant;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("ChatAssistant", () => {
  it("opens the panel from the launcher and shows the greeting", () => {
    render(<ChatAssistant />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.open }));
    const dialog = screen.getByRole("dialog", { name: t.title });
    expect(dialog).toBeTruthy();
    expect(screen.getByText(t.greeting)).toBeTruthy();
  });

  it("closes the panel on Escape", () => {
    render(<ChatAssistant />);
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the send button disabled until the draft is non-empty", () => {
    render(<ChatAssistant />);
    fireEvent.click(screen.getByRole("button", { name: t.open }));

    const send = screen.getByRole("button", {
      name: t.send,
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(t.placeholder), {
      target: { value: "I need a plumber" },
    });
    expect(send.disabled).toBe(false);
  });

  it("shows an error alert when the agent request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, body: null });
    const { container } = render(<ChatAssistant />);
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    fireEvent.change(screen.getByLabelText(t.placeholder), {
      target: { value: "I need a plumber" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.error);
    // The user's own message stays visible after the failure.
    expect(screen.getByText("I need a plumber")).toBeTruthy();
  });
});
