// Money edge conversion (#371): a DECIMAL(12,2) column surfaces as a Prisma
// Decimal, which JSON-serializes as a *string* — these helpers are what keeps
// `price`/`fromPrice` plain numbers on every API payload. The round-trip cases
// mirror the write path: an integer-rupee input (priceRupees enforces whole
// rupees) stored as DECIMAL(12,2) must come back as the identical number.
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { moneyToNumber, moneyToNumberOrNull } from "./money";

describe("moneyToNumber", () => {
  it("round-trips whole-rupee values through Decimal exactly", () => {
    for (const rupees of [50, 1500, 12_500, 150_000, 10_000_000]) {
      expect(moneyToNumber(new Prisma.Decimal(rupees).toDecimalPlaces(2))).toBe(rupees);
    }
  });

  it("converts the DECIMAL(12,2) string form Prisma reads back", () => {
    expect(moneyToNumber(new Prisma.Decimal("12500.00"))).toBe(12500);
  });

  it("passes plain numbers through unchanged", () => {
    expect(moneyToNumber(2500)).toBe(2500);
  });

  it("produces a value that JSON-serializes as a number, not a string", () => {
    // The raw Decimal would stringify as "12500" (a JSON string).
    expect(JSON.stringify({ price: new Prisma.Decimal("12500.00") })).toBe(
      '{"price":"12500"}'
    );
    expect(
      JSON.stringify({ price: moneyToNumber(new Prisma.Decimal("12500.00")) })
    ).toBe('{"price":12500}');
  });
});

describe("moneyToNumberOrNull", () => {
  it("maps null and undefined to null (providers with no services)", () => {
    expect(moneyToNumberOrNull(null)).toBeNull();
    expect(moneyToNumberOrNull(undefined)).toBeNull();
  });

  it("converts a present Decimal to a number", () => {
    expect(moneyToNumberOrNull(new Prisma.Decimal("1500.00"))).toBe(1500);
  });
});
