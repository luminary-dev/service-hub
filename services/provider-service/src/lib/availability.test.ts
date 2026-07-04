import { describe, it, expect } from "vitest";
import { isAway, isEffectivelyAvailable } from "./availability";

const NOW = new Date("2026-07-05T12:00:00Z");
const FUTURE = new Date("2026-08-01T00:00:00Z");
const PAST = new Date("2026-06-01T00:00:00Z");

describe("isEffectivelyAvailable", () => {
  it("is available when the toggle is on and no away date is set", () => {
    expect(isEffectivelyAvailable({ available: true, awayUntil: null }, NOW)).toBe(true);
  });

  it("is unavailable while awayUntil is in the future", () => {
    expect(isEffectivelyAvailable({ available: true, awayUntil: FUTURE }, NOW)).toBe(false);
  });

  it("flips back automatically once awayUntil has passed", () => {
    expect(isEffectivelyAvailable({ available: true, awayUntil: PAST }, NOW)).toBe(true);
  });

  it("treats awayUntil == now as no longer away (awayUntil <= now)", () => {
    expect(isEffectivelyAvailable({ available: true, awayUntil: NOW }, NOW)).toBe(true);
  });

  it("is unavailable when available=false regardless of awayUntil", () => {
    expect(isEffectivelyAvailable({ available: false, awayUntil: null }, NOW)).toBe(false);
    expect(isEffectivelyAvailable({ available: false, awayUntil: PAST }, NOW)).toBe(false);
    expect(isEffectivelyAvailable({ available: false, awayUntil: FUTURE }, NOW)).toBe(false);
  });
});

describe("isAway", () => {
  it("is away only while awayUntil is set and in the future", () => {
    expect(isAway({ awayUntil: FUTURE }, NOW)).toBe(true);
    expect(isAway({ awayUntil: PAST }, NOW)).toBe(false);
    expect(isAway({ awayUntil: NOW }, NOW)).toBe(false);
    expect(isAway({ awayUntil: null }, NOW)).toBe(false);
  });
});
