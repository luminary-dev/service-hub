// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import LoadingScreen from "./LoadingScreen";

// LoadingScreen is an async server component that reads the active locale via
// getLocale(); stub it so the render is deterministic per language.
const getLocale = vi.fn();
vi.mock("@/lib/locale", () => ({ getLocale: () => getLocale() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoadingScreen", () => {
  it("renders an accessible status region with the sr-only label", async () => {
    getLocale.mockResolvedValue("en");
    render(await LoadingScreen());

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText(dict.en.loading.label)).toBeTruthy();
    expect(screen.getByText(dict.en.loading.tagline)).toBeTruthy();
    // Wordmark is split across nodes — assert the branded ".lk" is present.
    expect(screen.getByText(".lk")).toBeTruthy();
  });

  it("localizes the copy for the Sinhala locale", async () => {
    getLocale.mockResolvedValue("si");
    render(await LoadingScreen());

    expect(screen.getByText(dict.si.loading.tagline)).toBeTruthy();
    expect(screen.getByText(dict.si.loading.label)).toBeTruthy();
  });
});
