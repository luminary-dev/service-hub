// @vitest-environment jsdom
//
// Hero slider (#447): the first slide renders (and is the only one exposed to
// assistive tech), autoplay advances on a timer, and both hover and
// prefers-reduced-motion stop the rotation. Manual controls always work.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import HeroSlider from "./HeroSlider";

const t = dict.en.home;
const COUNT = t.heroSlides.length;

let reducedMotion = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") && reducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  reducedMotion = false;
});

function slide(n: number) {
  return screen.queryByRole("group", { name: t.heroSlideOf(n, COUNT) });
}

describe("HeroSlider", () => {
  it("renders every slide image but exposes only the first to AT", () => {
    render(<HeroSlider />);

    // All images are in the DOM (crossfade layers)…
    for (const s of t.heroSlides) expect(screen.getByAltText(s.alt)).toBeTruthy();
    // …but only the active slide is in the accessibility tree.
    expect(slide(1)).toBeTruthy();
    expect(slide(2)).toBeNull();
    expect(screen.getByText(t.heroSlides[0].caption)).toBeTruthy();
  });

  it("auto-advances to the next slide after the interval", () => {
    render(<HeroSlider />);

    act(() => vi.advanceTimersByTime(5000));

    expect(slide(1)).toBeNull();
    expect(slide(2)).toBeTruthy();
    expect(screen.getByText(t.heroSlides[1].caption)).toBeTruthy();
  });

  it("does not auto-advance under prefers-reduced-motion", () => {
    reducedMotion = true;
    render(<HeroSlider />);

    act(() => vi.advanceTimersByTime(20000));

    expect(slide(1)).toBeTruthy();
    expect(slide(2)).toBeNull();
  });

  it("pauses autoplay on hover and resumes on leave", () => {
    render(<HeroSlider />);
    const figure = screen.getByRole("group", { name: t.heroCarouselLabel });

    fireEvent.mouseEnter(figure);
    act(() => vi.advanceTimersByTime(20000));
    expect(slide(1)).toBeTruthy();

    fireEvent.mouseLeave(figure);
    act(() => vi.advanceTimersByTime(5000));
    expect(slide(2)).toBeTruthy();
  });

  it("supports manual prev/next (wrapping) and dot navigation", () => {
    render(<HeroSlider />);

    fireEvent.click(screen.getByRole("button", { name: t.heroPrev }));
    expect(slide(COUNT)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: t.heroNext }));
    expect(slide(1)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: t.heroGoTo(3) }));
    expect(slide(3)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: t.heroGoTo(3) })
        .getAttribute("aria-current")
    ).toBe("true");
  });

  it("still allows manual navigation under reduced motion", () => {
    reducedMotion = true;
    render(<HeroSlider />);

    fireEvent.click(screen.getByRole("button", { name: t.heroNext }));
    expect(slide(2)).toBeTruthy();
  });
});
