import { describe, expect, it } from "vitest";
import { formatDate, formatLKR, formatNumber, intlLocale } from "./format";

// Exact Intl output can shift between ICU releases, so English assertions use
// stable literals (digit grouping hasn't changed in years) while Sinhala
// assertions check the localized parts we actually care about — Sinhala month
// names — rather than the full formatted string.

describe("intlLocale", () => {
  it("maps app locales to Intl locale tags", () => {
    expect(intlLocale("en")).toBe("en-LK");
    expect(intlLocale("si")).toBe("si-LK");
  });
});

describe("formatNumber", () => {
  it("groups digits for English", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
  });

  it("groups digits for Sinhala", () => {
    const out = formatNumber(1234567, "si");
    // si-LK uses latin digits with thousands grouping.
    expect(out).toMatch(/^1.234.567$/);
  });

  it("leaves small numbers ungrouped", () => {
    expect(formatNumber(950, "en")).toBe("950");
    expect(formatNumber(950, "si")).toBe("950");
  });
});

describe("formatLKR", () => {
  it("prefixes the rupee marker in both locales", () => {
    expect(formatLKR(60000, "en")).toBe("Rs. 60,000");
    expect(formatLKR(60000, "si")).toMatch(/^Rs\. 60.000$/);
  });

  // The API contract carries money as whole-rupee JSON numbers (#371 — stored
  // DECIMAL(12,2), converted back to numbers at the service edge). Lock the
  // display for the values the marketplace actually emits.
  it("renders whole-rupee amounts across the validated price range", () => {
    expect(formatLKR(50, "en")).toBe("Rs. 50");
    expect(formatLKR(12500, "en")).toBe("Rs. 12,500");
    expect(formatLKR(10_000_000, "en")).toBe("Rs. 10,000,000");
  });
});

describe("formatDate", () => {
  const date = "2026-01-05T12:00:00Z";

  it("uses English month names for en", () => {
    const out = formatDate(date, "en");
    expect(out).toContain("Jan");
    expect(out).toContain("2026");
    expect(out).toContain("5");
  });

  it("uses Sinhala month names for si", () => {
    const out = formatDate(date, "si");
    expect(out).toContain("දුරුතු"); // January in si-LK
    expect(out).toContain("2026");
    expect(out).not.toContain("Jan");
  });

  it("produces different output per locale", () => {
    expect(formatDate(date, "en")).not.toBe(formatDate(date, "si"));
  });

  it("accepts Date objects and honours custom options", () => {
    const out = formatDate(new Date("2026-07-04T12:00:00Z"), "en", {
      month: "long",
      year: "numeric",
    });
    expect(out).toContain("July");
    expect(out).toContain("2026");
  });
});
