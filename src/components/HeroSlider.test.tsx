// @vitest-environment jsdom
//
// HeroSlider is the animated home-hero carousel (#447). The auto-advance is
// rAF-driven and only meaningfully observable in the browser layer, so these
// tests cover the tractable, accessibility-critical behaviour: the structure,
// manual navigation, the explicit pause/play control, and the reduced-motion
// fallback (no autoplay control, no gauge).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { I18nProvider } from "./I18nProvider";
import HeroSlider from "./HeroSlider";

// next/image isn't reproducible in jsdom; render a plain <img> with just the
// src/alt so React doesn't warn about the framework-only props (fill/preload).
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

const t = dict.en.home;

// jsdom has no matchMedia; drive the reduced-motion state per test.
function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

function renderSlider() {
  return render(
    <I18nProvider locale="en">
      <HeroSlider />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HeroSlider (motion allowed)", () => {
  beforeEach(() => stubMatchMedia(false));

  it("renders an accessible carousel with all trade slides", () => {
    renderSlider();
    const region = screen.getByRole("group", { name: t.sliderRegion });
    expect(region.getAttribute("aria-roledescription")).toBe("carousel");
    // One image per slide, each with a non-empty, localized alt.
    const imgs = screen.getAllByRole("img", { hidden: true });
    expect(imgs).toHaveLength(16);
    imgs.forEach((img) => expect(img.getAttribute("alt")).toBeTruthy());
  });

  it("advances to the next slide via the next control", () => {
    renderSlider();
    // Live status starts on slide 1.
    expect(screen.getByText(t.sliderStatus(1, 16, "Mechanic"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.sliderNext }));
    expect(screen.getByText(t.sliderStatus(2, 16, "Electrician"))).toBeTruthy();
  });

  it("jumps to a slide via the tick selector", () => {
    renderSlider();
    fireEvent.click(screen.getByRole("button", { name: t.sliderGoto(3) }));
    expect(screen.getByText(t.sliderStatus(3, 16, "Plumber"))).toBeTruthy();
  });

  it("exposes an explicit pause/play toggle (WCAG 2.2.2)", () => {
    renderSlider();
    const pause = screen.getByRole("button", { name: t.sliderPause });
    fireEvent.click(pause);
    // Toggling flips it to the play affordance.
    expect(screen.getByRole("button", { name: t.sliderPlay })).toBeTruthy();
  });
});

describe("HeroSlider (reduced motion)", () => {
  beforeEach(() => stubMatchMedia(true));

  it("drops the autoplay control since nothing auto-advances", () => {
    renderSlider();
    // No pause/play toggle when there's no autoplay to stop.
    expect(screen.queryByRole("button", { name: t.sliderPause })).toBeNull();
    expect(screen.queryByRole("button", { name: t.sliderPlay })).toBeNull();
    // Manual navigation still works.
    expect(screen.getByRole("button", { name: t.sliderNext })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.sliderGoto(2) }));
    expect(screen.getByText(t.sliderStatus(2, 16, "Electrician"))).toBeTruthy();
  });
});
