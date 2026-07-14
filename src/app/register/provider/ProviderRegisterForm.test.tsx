// @vitest-environment jsdom
//
// Regression tests for the authed "become a provider" wizard (#552): step 0
// (which holds the only phone input in guest mode) is skipped, so the required
// phone must be collected and validated on the profile step instead —
// otherwise every submit 400s server-side on the missing phone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import ProviderRegisterForm from "./ProviderRegisterForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Leaflet can't run under jsdom — stub the map half of the location picker
// (#48); LocationPicker.test.tsx covers its wiring.
vi.mock("@/components/LocationPickerMap", () => ({
  default: () => <div data-testid="location-picker-map" />,
}));

const t = dict.en.providerReg;
const tt = dict.en.turnstile;
const fetchMock = vi.fn();

const categories = [
  { slug: "electrician", labelEn: "Electrician", labelSi: "විදුලි කාර්මික", icon: null },
  { slug: "plumber", labelEn: "Plumber", labelSi: "ජලනළ කාර්මික", icon: null },
];

function fillProfileStep({ phone }: { phone?: string } = {}) {
  if (phone !== undefined) {
    fireEvent.change(screen.getByLabelText(t.phone), { target: { value: phone } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Electrician" }));
  fireEvent.change(screen.getByLabelText(t.headline), {
    target: { value: "Reliable wiring work" },
  });
  fireEvent.change(screen.getByLabelText(t.about), {
    target: { value: "Ten years of residential wiring experience." },
  });
  fireEvent.change(screen.getByLabelText(t.district), {
    target: { value: "Colombo" },
  });
  fireEvent.change(screen.getByLabelText(t.townCity), {
    target: { value: "Nugegoda" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("ProviderRegisterForm (authed mode, #552)", () => {
  it("collects the phone on the profile step and blocks continue without it", () => {
    render(<ProviderRegisterForm categories={categories} authed />);
    // The wizard starts on the profile step with a phone field.
    expect(screen.getByLabelText(t.phone)).toBeTruthy();

    fillProfileStep(); // everything but the phone
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    // The error surfaces in the focus-managed summary (#378), linked to the
    // phone field it describes.
    expect(screen.getByRole("alert").textContent).toContain(t.errPhone);
    expect(screen.getByRole("link", { name: t.errPhone })).toBeTruthy();
    expect(
      screen.getByLabelText(t.phone).getAttribute("aria-describedby")
    ).toBe("pr-phone-error");
  });

  it("submits the collected phone to /api/auth/complete-provider", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    render(<ProviderRegisterForm categories={categories} authed />);

    fillProfileStep({ phone: "0771234567" });
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    // Contact & socials step is optional.
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    // Services step — the price-type select carries its own label, not the
    // service heading (#565).
    expect(
      screen.getByRole("combobox", { name: t.priceType }).tagName
    ).toBe("SELECT");
    fireEvent.change(screen.getByPlaceholderText(t.serviceTitlePh), {
      target: { value: "Full house wiring" },
    });
    fireEvent.change(screen.getByPlaceholderText(t.pricePh), {
      target: { value: "5000" },
    });
    // Registration consent (#62) gates the final step.
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: t.create }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/complete-provider");
    expect(JSON.parse(init.body).phone).toBe("0771234567");
  });

  it("includes the served set with the home district pinned first (#502)", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    render(<ProviderRegisterForm categories={categories} authed />);

    fillProfileStep({ phone: "0771234567" });
    // The home district renders as a pinned, non-toggleable chip.
    const home = screen.getByRole("button", {
      name: `Colombo · ${dict.en.serviceDistricts.homeBadge}`,
    }) as HTMLButtonElement;
    expect(home.disabled).toBe(true);
    // Add one extra served district.
    fireEvent.click(screen.getByRole("button", { name: "Gampaha" }));
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    fireEvent.change(screen.getByPlaceholderText(t.serviceTitlePh), {
      target: { value: "Full house wiring" },
    });
    fireEvent.change(screen.getByPlaceholderText(t.pricePh), {
      target: { value: "5000" },
    });
    // Registration consent (#62) gates the final step.
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: t.create }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).serviceDistricts).toEqual([
      "Colombo",
      "Gampaha",
    ]);
  });

  // Turnstile bot protection (#633): the widget appears on the final step of
  // guest registration when a site key is set, and blocks the create submit
  // until it is solved (the token never arrives under jsdom).
  it("shows the Turnstile widget on the final step in guest mode and blocks submit", () => {
    render(
      <ProviderRegisterForm categories={categories} turnstileSiteKey="test-key" />
    );
    // Step 0 — account (phone lives here in guest mode).
    fireEvent.change(screen.getByLabelText(t.fullName), {
      target: { value: "Nuwan Perera" },
    });
    fireEvent.change(screen.getByLabelText(t.email), {
      target: { value: "nuwan@example.com" },
    });
    fireEvent.change(screen.getByLabelText(t.phone), {
      target: { value: "0771234567" },
    });
    fireEvent.change(screen.getByLabelText(t.password), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    // Step 1 — profile (phone already collected on step 0).
    fillProfileStep();
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    // Step 2 — contact & socials (optional).
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    // Step 3 — services, consent, and the challenge.
    expect(screen.getByText(tt.label)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(t.serviceTitlePh), {
      target: { value: "Full house wiring" },
    });
    fireEvent.change(screen.getByPlaceholderText(t.pricePh), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: t.create }));
    // No token → submit is held and the localized prompt is shown; no POST.
    expect(screen.getAllByText(tt.required).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never renders the Turnstile widget in authed mode", () => {
    render(
      <ProviderRegisterForm categories={categories} authed turnstileSiteKey="test-key" />
    );
    // Walk to the final step; the widget must never appear (complete-provider
    // creates no account, so it isn't the enumeration oracle #633 guards).
    fillProfileStep({ phone: "0771234567" });
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    expect(screen.queryByText(tt.label)).toBeNull();
  });

  it("keeps the phone on the account step only in guest mode", () => {
    render(<ProviderRegisterForm categories={categories} />);
    expect(screen.getByLabelText(t.phone)).toBeTruthy(); // step 0
    fireEvent.change(screen.getByLabelText(t.fullName), {
      target: { value: "Nuwan Perera" },
    });
    fireEvent.change(screen.getByLabelText(t.email), {
      target: { value: "nuwan@example.com" },
    });
    fireEvent.change(screen.getByLabelText(t.phone), {
      target: { value: "0771234567" },
    });
    fireEvent.change(screen.getByLabelText(t.password), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.continue }));
    // No duplicate phone field on the profile step.
    expect(screen.queryByLabelText(t.phone)).toBeNull();
  });
});
