// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import SplashScreen from "./SplashScreen";

const getLocale = vi.fn();
vi.mock("@/lib/locale", () => ({ getLocale: () => getLocale() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SplashScreen", () => {
  it("renders the self-dismissing branded overlay with localized copy", async () => {
    getLocale.mockResolvedValue("en");
    render(await SplashScreen());

    const status = screen.getByRole("status");
    // The CSS animation class is what fades it out (globals.css); without it
    // the overlay would never dismiss.
    expect(status.className).toContain("splash-screen");
    expect(screen.getByText(dict.en.loading.tagline)).toBeTruthy();
    expect(screen.getByText(dict.en.loading.label)).toBeTruthy();
    expect(screen.getByText(".lk")).toBeTruthy();
  });

  it("localizes the copy for the Sinhala locale", async () => {
    getLocale.mockResolvedValue("si");
    render(await SplashScreen());

    expect(screen.getByText(dict.si.loading.tagline)).toBeTruthy();
  });
});
