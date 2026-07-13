// @vitest-environment jsdom
//
// Automated WCAG checks (#66): every test renders a high-traffic component
// and asserts axe-core reports zero serious/critical violations. This guards
// names/roles/labels/ARIA wiring; it does NOT replace a manual audit — see
// docs/TESTING.md ("Accessibility") for what still needs a browser and a
// screen reader.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { dict } from "@/lib/i18n";
import { I18nProvider } from "./I18nProvider";
import { ToastProvider, useToast } from "./ToastProvider";
import MobileMenu from "./MobileMenu";
import ProviderCard, { type ProviderCardDTO } from "./ProviderCard";
import FilterBar from "./FilterBar";
import SearchBar from "./SearchBar";
import InquiryForm from "./InquiryForm";
import SecuritySettings from "./SecuritySettings";
import MessageThread from "./MessageThread";
import ChatAssistant from "./ChatAssistant";
import ReportButton from "./ReportButton";
import PhotoGallery from "./PhotoGallery";
import ReviewSection from "./ReviewSection";
import LoginPage from "@/app/login/page";
import CustomerRegisterPage from "@/app/register/customer/page";
import ProviderRegisterForm from "@/app/register/provider/ProviderRegisterForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const t = dict.en;

// Axe walks the whole rule set per run; give the first (cold) run headroom.
const AXE_TIMEOUT = 30_000;

/**
 * Runs axe on a rendered container and asserts no serious/critical
 * violations. color-contrast is excluded: jsdom has no layout engine, so the
 * rule cannot resolve real colors — contrast is a manual/browser check.
 */
async function expectNoAxeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  const severe = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.html),
    }));
  expect(severe).toEqual([]);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no layout: scrollIntoView (chat/thread autoscroll) is a no-op.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const cardFixture: ProviderCardDTO = {
  id: "prov_1",
  userId: "user_1",
  name: "Sunil Perera",
  category: "electrician",
  categoryImageUrl: null,
  headline: "House wiring and repairs across Colombo",
  district: "Colombo",
  city: "Nugegoda",
  experience: 8,
  available: true,
  awayUntil: null,
  verificationStatus: "VERIFIED",
  verifiedAt: "2025-06-01T00:00:00.000Z",
  createdAt: "2024-01-15T00:00:00.000Z",
  avatarUrl: null,
  coverPhoto: "/uploads/cover.jpg",
  photos: [],
  services: [
    { id: "svc_1", title: "Full house wiring", price: 50000, priceType: "FIXED" },
  ],
  fromPrice: 50000,
  fromPriceType: "FIXED",
  rating: 4.6,
  reviewCount: 12,
};

const photosFixture = [
  { id: "ph_1", url: "/uploads/one.jpg", caption: "Rewired kitchen" },
  { id: "ph_2", url: "/uploads/two.jpg", caption: null },
];

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

describe("axe: navigation", () => {
  it("MobileMenu (closed and open) has no violations", async () => {
    const { container } = render(
      <I18nProvider locale="en">
        <MobileMenu session={{ role: "PROVIDER" }} theme="light" />
      </I18nProvider>
    );
    await expectNoAxeViolations(container);

    fireEvent.click(screen.getByRole("button", { name: t.nav.openMenu }));
    expect(screen.getByRole("navigation")).toBeDefined();
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);
});

describe("axe: browse & search", () => {
  it("ProviderCard (with favorite button) has no violations", async () => {
    const { container } = render(
      <ToastProvider>
        <ProviderCard p={cardFixture} locale="en" showFavorite />
      </ToastProvider>
    );
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("FilterBar has no violations", async () => {
    const { container } = render(
      <FilterBar q="" category="" district="" sort="recommended" />
    );
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("SearchBar has no violations", async () => {
    const { container } = render(<SearchBar />);
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);
});

describe("axe: feedback", () => {
  function ToastTrigger() {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast.success("Saved!")}>
        fire toast
      </button>
    );
  }

  it("an active toast has no violations", async () => {
    const { container } = render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "fire toast" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved!");
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);
});

describe("axe: forms", () => {
  it("login page has no violations", async () => {
    const { container } = render(<LoginPage />);
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("customer registration has no violations", async () => {
    const { container } = render(<CustomerRegisterPage />);
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("provider registration (each step) has no violations", async () => {
    const { container } = render(
      <ProviderRegisterForm
        categories={[
          { slug: "electrician", labelEn: "Electrician", labelSi: "විදුලි කාර්මික", icon: null },
          { slug: "plumber", labelEn: "Plumber", labelSi: "ජලනළ කාර්මික", icon: null },
        ]}
      />
    );
    // Step 0 (account details).
    await expectNoAxeViolations(container);
    // Walking to later steps trips validation; the inline error must also
    // be accessible.
    fireEvent.click(screen.getByRole("button", { name: t.providerReg.continue }));
    expect(screen.getByRole("alert").textContent).toBe(t.providerReg.errName);
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("provider registration wizard submits as a form and manages focus on step change (#564)", async () => {
    const { container } = render(
      <ProviderRegisterForm
        categories={[
          { slug: "electrician", labelEn: "Electrician", labelSi: "විදුලි කාර්මික", icon: null },
        ]}
      />
    );
    const r = t.providerReg;
    // Each step renders inside a <form> whose Continue/Create button is the
    // submit, so Enter in a field advances instead of doing nothing.
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(
      screen.getByRole("button", { name: r.continue }).getAttribute("type")
    ).toBe("submit");

    // Submitting (as Enter would) runs the same step validation…
    fireEvent.submit(form!);
    expect(screen.getByRole("alert").textContent).toBe(r.errName);

    // …and with valid fields advances to the next step.
    fireEvent.change(screen.getByLabelText(r.fullName), {
      target: { value: "Nuwan Perera" },
    });
    fireEvent.change(screen.getByLabelText(r.email), {
      target: { value: "nuwan@example.com" },
    });
    fireEvent.change(screen.getByLabelText(r.phone), {
      target: { value: "0771234567" },
    });
    fireEvent.change(screen.getByLabelText(r.password), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.submit(form!);

    // Focus moves to the new step's heading, which announces the full
    // "Step n of N" context to screen readers.
    const heading = screen.getByRole("heading", {
      name: r.stepOf(2, r.steps.length, r.steps[1]),
    });
    expect(document.activeElement).toBe(heading);

    // The stepper marks the active step, and Back also refocuses the heading.
    expect(
      container.querySelector('[aria-current="step"]')?.textContent
    ).toContain(r.steps[1]);
    fireEvent.click(screen.getByRole("button", { name: r.back }));
    expect(document.activeElement?.textContent).toContain(
      r.stepOf(1, r.steps.length, r.steps[0])
    );
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("inquiry form has no violations", async () => {
    const { container } = render(
      <InquiryForm providerId="prov_1" providerName="Sunil Perera" defaultName="" />
    );
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("security settings has no violations", async () => {
    const { container } = render(
      <ToastProvider>
        <SecuritySettings />
      </ToastProvider>
    );
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("review section with the form open has no violations", async () => {
    const { container } = render(
      <ToastProvider>
        <ReviewSection
          providerId="prov_1"
          providerName="Nimal"
          reviews={[
            {
              id: "rev_1",
              rating: 5,
              comment: "Great work, on time.",
              createdAt: "2025-05-01T00:00:00.000Z",
              userName: "Kasun",
              photos: [{ id: "rph_1", url: "/uploads/review.jpg" }],
              response: {
                text: "Thank you for the kind words!",
                createdAt: "2025-05-02T00:00:00.000Z",
              },
            },
          ]}
          canReview
          canRespond={false}
          signedIn
          myReview={null}
          summary={{
            rating: 4.5,
            count: 2,
            dimensions: {
              quality: 5,
              punctuality: null,
              value: 4,
              communication: 4.5,
            },
            distribution: { "5": 1, "4": 1, "3": 0, "2": 0, "1": 0 },
          }}
        />
      </ToastProvider>
    );
    await expectNoAxeViolations(container);

    fireEvent.click(screen.getByRole("button", { name: t.reviews.write }));
    expect(screen.getByRole("group", { name: t.reviews.rating })).toBeDefined();
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);
});

describe("axe: messaging", () => {
  it("message thread has no violations", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => threadFixture,
    });
    const { container } = render(<MessageThread inquiryId="inq_1" />);
    await screen.findByRole("heading", {
      name: t.messages.threadWith("Sunil Perera"),
    });
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);

  it("chat assistant (open) has no violations", async () => {
    const { container } = render(<ChatAssistant />);
    await expectNoAxeViolations(container);

    fireEvent.click(screen.getByRole("button", { name: t.assistant.open }));
    expect(screen.getByRole("dialog", { name: t.assistant.title })).toBeDefined();
    await expectNoAxeViolations(container);
  }, AXE_TIMEOUT);
});

describe("axe: modals", () => {
  it("report modal has no violations and manages focus", async () => {
    const { container } = render(
      <ToastProvider>
        <ReportButton
          endpoint="/api/providers/prov_1/report"
          label={t.report.reportProvider}
          variant="chip"
        />
      </ToastProvider>
    );
    const trigger = screen.getByRole("button", { name: t.report.reportProvider });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: t.report.reportProvider });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Focus moves into the modal on open…
    expect(document.activeElement?.id).toBe("report-reason");
    await expectNoAxeViolations(container);

    // …Escape closes it and hands focus back to the trigger.
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  }, AXE_TIMEOUT);

  it("photo gallery grid and lightbox have no violations and manage focus", async () => {
    // The lightbox hosts a ReportButton, which toasts its outcome.
    const { container } = render(
      <ToastProvider>
        <PhotoGallery photos={photosFixture} />
      </ToastProvider>
    );
    await expectNoAxeViolations(container);

    const thumb = screen.getByRole("button", {
      name: t.profile.viewPhotoCaption("Rewired kitchen"),
    });
    fireEvent.click(thumb);
    const dialog = screen.getByRole("dialog", { name: t.profile.photoViewer });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Close button is focused on open…
    const close = screen.getByRole("button", { name: t.profile.closePhoto });
    expect(document.activeElement).toBe(close);
    await expectNoAxeViolations(container);

    // …Escape closes and returns focus to the thumbnail that opened it.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(thumb);
  }, AXE_TIMEOUT);
});
