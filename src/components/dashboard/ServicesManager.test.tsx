// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import ServicesManager from "./ServicesManager";
import type { ServiceItem } from "./DashboardTabs";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const s = dict.en.dashboard.services;
const fetchMock = vi.fn();

const services: ServiceItem[] = [
  {
    id: "svc_1",
    title: "Full house wiring",
    description: "Complete rewiring",
    price: 50000,
    priceType: "FIXED",
  },
  {
    id: "svc_2",
    title: "Fan installation",
    description: "",
    price: 3000,
    priceType: "FIXED",
  },
];

function renderManager(initial: ServiceItem[] = services) {
  return render(<ServicesManager initial={initial} />);
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

describe("ServicesManager", () => {
  it("validates title and price locally before any request", () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: s.add }));
    // Leave the title blank / price empty, then save.
    fireEvent.click(screen.getByRole("button", { name: s.save }));

    expect(screen.getByRole("alert").textContent).toContain(
      s.titlePriceRequired
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a new service and appends it to the list on success", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        service: {
          id: "svc_3",
          title: "Socket repair",
          description: "",
          price: 1500,
          priceType: "FIXED",
        },
      }),
    });
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: s.add }));
    fireEvent.change(screen.getByLabelText(s.titlePh), {
      target: { value: "Socket repair" },
    });
    fireEvent.change(screen.getByLabelText(s.pricePh, { selector: "input" }), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.save }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider/services",
      expect.objectContaining({ method: "POST" })
    );
    expect(await screen.findByText("Socket repair")).toBeTruthy();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("disables the save button while the request is in flight", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: s.add }));
    fireEvent.change(screen.getByLabelText(s.titlePh), {
      target: { value: "Socket repair" },
    });
    fireEvent.change(screen.getByLabelText(s.pricePh, { selector: "input" }), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.save }));

    expect(
      (screen.getByRole("button", { name: s.saving }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("shows the server error via role=alert when saving fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Price out of range" }),
    });
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: s.add }));
    fireEvent.change(screen.getByLabelText(s.titlePh), {
      target: { value: "Socket repair" },
    });
    fireEvent.change(screen.getByLabelText(s.pricePh, { selector: "input" }), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.save }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Price out of range");
  });

  it("refuses to delete the last remaining service", () => {
    renderManager([services[0]]);
    fireEvent.click(screen.getByRole("button", { name: s.delete }));
    expect(screen.getByRole("alert").textContent).toContain(s.keepOne);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DELETEs a service and drops it from the list", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderManager();
    fireEvent.click(screen.getAllByRole("button", { name: s.delete })[0]);

    expect(fetchMock).toHaveBeenCalledWith("/api/provider/services/svc_1", {
      method: "DELETE",
    });
    await vi.waitFor(() =>
      expect(screen.queryByText("Full house wiring")).toBeNull()
    );
  });

  // A dropped connection must not fail silently (#363): the row stays and the
  // error is announced.
  it("keeps the service and shows an error when the DELETE rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderManager();
    fireEvent.click(screen.getAllByRole("button", { name: s.delete })[0]);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(s.deleteError);
    expect(screen.getByText("Full house wiring")).toBeTruthy();
  });
});
