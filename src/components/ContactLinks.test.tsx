// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import ContactLinks from "./ContactLinks";

const t = dict.en.profile;
const fetchMock = vi.fn();

// Contact details (phone digits AND the email address) are PII kept out of the
// public payload (#64/#655); the component only receives has* flags and reveals
// the real values from the rate-limited POST /:id/contact on an explicit tap.
function renderLinks(overrides: Partial<Parameters<typeof ContactLinks>[0]> = {}) {
  return render(
    <ContactLinks
      providerId="prov_1"
      hasPhone={false}
      hasWhatsapp={false}
      hasPhone2={false}
      hasEmail={false}
      facebook={null}
      instagram={null}
      tiktok={null}
      youtube={null}
      website={null}
      {...overrides}
    />
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

describe("ContactLinks", () => {
  it("offers the reveal affordance when only an email exists (#655)", () => {
    renderLinks({ hasEmail: true });
    expect(screen.getByRole("button", { name: t.showNumber })).toBeTruthy();
  });

  it("shows no reveal affordance when the provider has no phone or email", () => {
    renderLinks();
    expect(screen.queryByRole("button", { name: t.showNumber })).toBeNull();
  });

  it("reveals the phone and email from the rate-limited endpoint on tap (#655)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        phone: "0770000000",
        whatsapp: null,
        phone2: null,
        email: "pro@baas.lk",
      }),
    });
    renderLinks({ hasPhone: true, hasEmail: true });

    fireEvent.click(screen.getByRole("button", { name: t.showNumber }));

    expect(fetchMock).toHaveBeenCalledWith("/api/providers/prov_1/contact", {
      method: "POST",
    });

    const tel = await screen.findByRole("link", { name: /0770000000/ });
    expect(tel.getAttribute("href")).toBe("tel:0770000000");
    const mail = await screen.findByRole("link", { name: /pro@baas\.lk/ });
    expect(mail.getAttribute("href")).toBe("mailto:pro@baas.lk");
  });

  it("does not render an email link when the reveal returns none", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        phone: "0770000000",
        whatsapp: null,
        phone2: null,
        email: null,
      }),
    });
    renderLinks({ hasPhone: true });

    fireEvent.click(screen.getByRole("button", { name: t.showNumber }));
    await screen.findByRole("link", { name: /0770000000/ });
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /mailto:/ })).toBeNull()
    );
  });
});
