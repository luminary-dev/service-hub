import { describe, it, expect } from "vitest";
import {
  normalizeSlPhone,
  normalizeWebUrl,
  optionalSlPhone,
  optionalWebUrl,
  priceRupees,
  slPhone,
} from "./field-rules";

describe("normalizeSlPhone", () => {
  it.each([
    ["0771234567", "+94771234567"],
    ["077 123 4567", "+94771234567"],
    ["077-123-4567", "+94771234567"],
    ["(077) 1234567", "+94771234567"],
    ["+94771234567", "+94771234567"],
    ["0094771234567", "+94771234567"],
    ["94771234567", "+94771234567"],
    ["0112345678", "+94112345678"], // Colombo landline
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeSlPhone(input)).toBe(expected);
  });

  it.each([
    "071",
    "07712345678", // too many digits
    "0071234567", // second digit 0 is not a valid area/operator code
    "12345678901",
    "+1 555 000 1234",
    "not-a-phone",
    "",
  ])("rejects %s", (input) => {
    expect(normalizeSlPhone(input)).toBeNull();
  });
});

describe("slPhone / optionalSlPhone schemas", () => {
  it("transforms to E.164", () => {
    expect(slPhone.parse("0771234567")).toBe("+94771234567");
  });

  it("rejects invalid phones", () => {
    expect(slPhone.safeParse("12345").success).toBe(false);
  });

  it("optional variant keeps empty as empty", () => {
    expect(optionalSlPhone.parse("")).toBe("");
    expect(optionalSlPhone.parse(undefined)).toBeUndefined();
    expect(optionalSlPhone.parse("0771234567")).toBe("+94771234567");
  });
});

describe("normalizeWebUrl", () => {
  it("adds https:// to scheme-less input", () => {
    expect(normalizeWebUrl("facebook.com/nuwan")).toBe("https://facebook.com/nuwan");
  });

  it("keeps http(s) URLs", () => {
    expect(normalizeWebUrl("https://baas.lk/x")).toBe("https://baas.lk/x");
    expect(normalizeWebUrl("http://baas.lk")).toBe("http://baas.lk/");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://files.example.com",
    "https://user:pass@evil.example",
    "localhost", // dotless host
    "",
  ])("rejects %s", (input) => {
    expect(normalizeWebUrl(input)).toBeNull();
  });

  it("rejects over-long input", () => {
    expect(normalizeWebUrl(`example.com/${"a".repeat(200)}`)).toBeNull();
  });
});

describe("optionalWebUrl schema", () => {
  it("keeps empty as empty and normalizes values", () => {
    expect(optionalWebUrl.parse("")).toBe("");
    expect(optionalWebUrl.parse(undefined)).toBeUndefined();
    expect(optionalWebUrl.parse("instagram.com/kumari")).toBe(
      "https://instagram.com/kumari"
    );
  });

  it("rejects dangerous schemes", () => {
    expect(optionalWebUrl.safeParse("javascript:alert(1)").success).toBe(false);
  });
});

describe("priceRupees", () => {
  it("accepts whole rupees in bounds", () => {
    expect(priceRupees.parse(50)).toBe(50);
    expect(priceRupees.parse(12500)).toBe(12500);
    expect(priceRupees.parse(10_000_000)).toBe(10_000_000);
  });

  it.each([[49], [10_000_001], [99.5], [0], [-100]])("rejects %s", (v) => {
    expect(priceRupees.safeParse(v).success).toBe(false);
  });
});
