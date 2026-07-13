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

  // Hydration safety (#377): output is pinned to Asia/Colombo, so a UTC
  // server and a browser in any timezone render the same calendar day.
  it("renders the Sri Lanka calendar day regardless of process timezone", () => {
    // 20:00 UTC is already the next day (01:30) in Colombo (+05:30). \b keeps
    // the day assertion from matching inside "2026"; day/month order is ICU's.
    expect(formatDate("2026-01-05T20:00:00Z", "en")).toMatch(/\b6\b/);
    // …and just before midnight UTC stays that same Colombo day.
    expect(formatDate("2026-01-05T23:59:00Z", "en")).toMatch(/\b6\b/);
    expect(formatDate("2026-01-05T23:59:00Z", "en")).not.toMatch(/\b5\b/);
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
