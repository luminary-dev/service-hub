import { describe, expect, it } from "vitest";
import {
  languageAlternates,
  localizedHref,
  loginNextHref,
  pathLocale,
  sanitizeNext,
} from "./links";

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

describe("sanitizeNext", () => {
  it("accepts same-origin relative paths, locale prefix included", () => {
    expect(sanitizeNext("/jobs")).toBe("/jobs");
    expect(sanitizeNext("/si/providers/abc")).toBe("/si/providers/abc");
    expect(sanitizeNext("/account?tab=reviews")).toBe("/account?tab=reviews");
  });

  it("rejects anything that could leave the origin", () => {
    expect(sanitizeNext("https://evil.com")).toBeNull();
    expect(sanitizeNext("//evil.com")).toBeNull();
    // URL parsers normalize backslashes to "/" — "/\\evil.com" is "//evil.com".
    expect(sanitizeNext("/\\evil.com")).toBeNull();
    expect(sanitizeNext("javascript:alert(1)")).toBeNull();
    expect(sanitizeNext("providers")).toBeNull();
    expect(sanitizeNext("")).toBeNull();
    expect(sanitizeNext(null)).toBeNull();
    expect(sanitizeNext(undefined)).toBeNull();
  });
});

describe("loginNextHref", () => {
  it("builds a /login URL with the return-to percent-encoded", () => {
    expect(loginNextHref("/jobs")).toBe("/login?next=%2Fjobs");
    expect(loginNextHref("/si/providers/abc?x=1")).toBe(
      "/login?next=%2Fsi%2Fproviders%2Fabc%3Fx%3D1",
    );
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
