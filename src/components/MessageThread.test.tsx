// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "./ToastProvider";
import MessageThread from "./MessageThread";

// The session guard (#774) reads useRouter/usePathname.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/account/inquiries/inq_1",
}));

const t = dict.en.messages;
const tr = dict.en.report;

// The per-message ReportButton (#376) needs the toast context.
function renderThread(inquiryId = "inq_1") {
  return render(
    <ToastProvider>
      <MessageThread inquiryId={inquiryId} />
    </ToastProvider>
  );
}
const fetchMock = vi.fn();

const threadFixture = {
  party: "CUSTOMER" as const,
  inquiry: {
    id: "inq_1",
    status: "RESPONDED",
    message: "Can you fix my wiring?",
    createdAt: "2025-06-01T09:00:00.000Z",
    customerName: "Kasun",
    provider: { id: "prov_1", name: "Sunil Perera" },
  },
  messages: [
    {
      id: "msg_1",
      sender: "PROVIDER" as const,
      body: "Yes, I can come on Monday.",
      createdAt: "2025-06-01T10:00:00.000Z",
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no layout engine; the autoscroll ref call is a no-op.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("MessageThread", () => {
  it("loads the conversation and renders the counterpart heading + messages", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => threadFixture });
    renderThread();

    expect(
      await screen.findByRole("heading", {
        name: t.threadWith("Sunil Perera"),
      })
    ).toBeTruthy();
    expect(screen.getByText("Yes, I can come on Monday.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/inquiries/inq_1/messages", {
      signal: expect.any(AbortSignal),
    });
  });

  it("shows a load-failure alert when the initial fetch fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderThread();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.loadFailed);
  });

  it("keeps the send button disabled until a message is typed", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => threadFixture });
    renderThread();
    await screen.findByRole("heading", { name: t.threadWith("Sunil Perera") });

    const button = screen.getByRole("button", {
      name: t.send,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(t.placeholder), {
      target: { value: "See you Monday" },
    });
    expect(button.disabled).toBe(false);
  });

  it("posts a new message and appends it to the log", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => threadFixture,
    });
    const { container } = renderThread();
    await screen.findByRole("heading", { name: t.threadWith("Sunil Perera") });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          id: "msg_2",
          sender: "CUSTOMER",
          body: "See you Monday",
          createdAt: "2025-06-01T11:00:00.000Z",
        },
      }),
    });
    fireEvent.change(screen.getByLabelText(t.placeholder), {
      target: { value: "See you Monday" },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(fetchMock).toHaveBeenLastCalledWith("/api/inquiries/inq_1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "See you Monday" }),
    });
    expect(await screen.findByText("See you Monday")).toBeTruthy();
  });

  it("offers a report action on the counterpart's messages only (#376)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...threadFixture,
        messages: [
          ...threadFixture.messages,
          {
            id: "msg_mine",
            sender: "CUSTOMER" as const,
            body: "Thanks!",
            createdAt: "2025-06-01T10:30:00.000Z",
          },
        ],
      }),
    });
    renderThread();
    await screen.findByRole("heading", { name: t.threadWith("Sunil Perera") });

    // One report trigger for the provider's message, none for the caller's own.
    expect(screen.getAllByRole("button", { name: tr.reportMessage })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: tr.reportMessage }));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/messages/msg_1/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "spam", details: undefined }),
    });
  });

  it("shows the load-failure alert when the initial fetch rejects (#377)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderThread();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.loadFailed);
  });

  it("recovers from a rejected send with an alert and a re-enabled button (#363)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => threadFixture,
    });
    const { container } = renderThread();
    await screen.findByRole("heading", { name: t.threadWith("Sunil Perera") });

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.change(screen.getByLabelText(t.placeholder), {
      target: { value: "See you Monday" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.sendFailed);
    const button = screen.getByRole("button", {
      name: t.send,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("refetches when the window regains focus (#661)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => threadFixture });
    renderThread();
    await screen.findByRole("heading", { name: t.threadWith("Sunil Perera") });
    const before = fetchMock.mock.calls.length;

    window.dispatchEvent(new Event("focus"));

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
    );
  });

  it("renders a 'Deleted provider' counterpart when the provider was erased (#650)", async () => {
    // Provider erased → the thread survives detached, header carries
    // provider: null. The customer still sees their conversation.
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ...threadFixture, inquiry: { ...threadFixture.inquiry, provider: null } }),
    });
    renderThread();

    expect(
      await screen.findByRole("heading", {
        name: t.threadWith(t.deletedProvider),
      })
    ).toBeTruthy();
    expect(screen.getByText("Yes, I can come on Monday.")).toBeTruthy();
  });

  it("shows a send-failure alert when the POST fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => threadFixture,
    });
    const { container } = renderThread();
    await screen.findByRole("heading", { name: t.threadWith("Sunil Perera") });

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    fireEvent.change(screen.getByLabelText(t.placeholder), {
      target: { value: "See you Monday" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t.sendFailed);
  });
});
