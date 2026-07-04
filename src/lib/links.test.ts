import { describe, expect, it } from "vitest";
import { languageAlternates, localizedHref, pathLocale } from "./links";

describe("pathLocale", () => {
  it("detects the /si prefix", () => {
    expect(pathLocale("/si")).toBe("si");
    expect(pathLocale("/si/providers")).toBe("si");
    expect(pathLocale("/")).toBe("en");
    expect(pathLocale("/providers")).toBe("en");
    // Not a locale prefix — just a path that starts with the letters "si".
    expect(pathLocale("/sinhala-page")).toBe("en");
  });
});

describe("localizedHref", () => {
  it("prefixes paths for Sinhala", () => {
    expect(localizedHref("/", "si")).toBe("/si");
    expect(localizedHref("/providers", "si")).toBe("/si/providers");
    expect(localizedHref("/providers/abc", "si")).toBe("/si/providers/abc");
  });

  it("leaves English paths at the root", () => {
    expect(localizedHref("/", "en")).toBe("/");
    expect(localizedHref("/providers", "en")).toBe("/providers");
  });

  it("strips an existing /si prefix when switching to English", () => {
    expect(localizedHref("/si", "en")).toBe("/");
    expect(localizedHref("/si/providers", "en")).toBe("/providers");
  });

  it("is idempotent for already-prefixed Sinhala paths", () => {
    expect(localizedHref("/si/providers", "si")).toBe("/si/providers");
    expect(localizedHref("/si", "si")).toBe("/si");
  });

  it("preserves query strings and hashes", () => {
    expect(localizedHref("/providers?category=plumber&page=2", "si")).toBe(
      "/si/providers?category=plumber&page=2",
    );
    expect(localizedHref("/si/providers?page=3", "en")).toBe(
      "/providers?page=3",
    );
    expect(localizedHref("/si?q=x", "en")).toBe("/?q=x");
    expect(localizedHref("/providers#reviews", "si")).toBe(
      "/si/providers#reviews",
    );
  });

  it("does not treat /si-lookalike segments as the prefix", () => {
    expect(localizedHref("/sinhala-page", "si")).toBe("/si/sinhala-page");
    expect(localizedHref("/sinhala-page", "en")).toBe("/sinhala-page");
  });
});

describe("languageAlternates", () => {
  it("marks the English root as canonical for unprefixed URLs", () => {
    expect(languageAlternates("/providers", "en")).toEqual({
      canonical: "/providers",
      languages: {
        en: "/providers",
        si: "/si/providers",
        "x-default": "/providers",
      },
    });
  });

  it("marks the /si URL as canonical for prefixed URLs", () => {
    expect(languageAlternates("/", "si")).toEqual({
      canonical: "/si",
      languages: { en: "/", si: "/si", "x-default": "/" },
    });
  });
});
