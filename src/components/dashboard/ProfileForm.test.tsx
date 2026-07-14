// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import ProfileForm from "./ProfileForm";
import type { DashboardData } from "./DashboardTabs";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

// Leaflet can't run under jsdom — stub the map half of the location picker
// (#48); LocationPicker.test.tsx covers its wiring.
vi.mock("@/components/LocationPickerMap", () => ({
  default: () => <div data-testid="location-picker-map" />,
}));

const p = dict.en.dashboard.profile;
const fetchMock = vi.fn();

const data: DashboardData = {
  providerId: "prov_1",
  name: "Nuwan Perera",
  email: "nuwan@example.com",
  phone: "0771234567",
  category: "electrician",
  headline: "House wiring and repairs",
  bio: "Fifteen years wiring homes across Colombo district.",
  district: "Colombo",
  serviceDistricts: ["Colombo", "Gampaha"],
  city: "Nugegoda",
  latitude: null,
  longitude: null,
  experience: 15,
  available: true,
  awayUntil: null,
  avatarUrl: null,
  coverPhoto: null,
  whatsapp: "",
  phone2: "",
  facebook: "",
  instagram: "",
  tiktok: "",
  youtube: "",
  website: "",
  services: [],
  photos: [],
  inquiries: [],
  inquiriesTotal: 0,
  stats: { rating: 4.6, reviewCount: 12, photoCount: 3, newInquiries: 1 },
};

function renderForm() {
  return render(
    <ToastProvider>
      <ProfileForm data={data} />
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

describe("ProfileForm", () => {
  it("prefills the form from the provider's saved data", () => {
    renderForm();
    expect((screen.getByLabelText(p.fullName) as HTMLInputElement).value).toBe(
      "Nuwan Perera"
    );
    expect((screen.getByLabelText(p.headline) as HTMLInputElement).value).toBe(
      "House wiring and repairs"
    );
    const name = screen.getByLabelText(p.fullName) as HTMLInputElement;
    expect(name.required).toBe(true);
    expect(name.minLength).toBe(2);
  });

  it("PUTs the edited profile and confirms with a toast", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = renderForm();
    fireEvent.change(screen.getByLabelText(p.fullName), {
      target: { value: "Nuwan K. Perera" },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/provider/profile");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("Nuwan K. Perera");
    expect(body.experience).toBe(15);
    expect(body.awayUntil).toBeNull();
    // Served set (#502) rides along, home district pinned first.
    expect(body.serviceDistricts).toEqual(["Colombo", "Gampaha"]);

    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain(p.saved);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("toggling a district chip updates the served set in the payload (#502)", () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = renderForm();
    // Deselect the saved extra and pick a different one.
    fireEvent.click(screen.getByRole("button", { name: "Gampaha" }));
    fireEvent.click(screen.getByRole("button", { name: "Kalutara" }));
    fireEvent.submit(container.querySelector("form")!);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.serviceDistricts).toEqual(["Colombo", "Kalutara"]);
  });

  it("disables the submit button while saving", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderForm();
    fireEvent.submit(container.querySelector("form")!);
    const button = screen.getByRole("button", { name: p.saving });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces the server error via role=alert", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Headline is too short" }),
    });
    const { container } = renderForm();
    fireEvent.submit(container.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Headline is too short");
    expect(refresh).not.toHaveBeenCalled();
  });
});
