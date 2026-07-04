import { describe, expect, it } from "vitest";
import { CATEGORIES, DISTRICTS, PRICE_TYPES } from "./constants";
import {
  categoryLabelLoc,
  dict,
  districtLabelLoc,
  priceTypeLabelLoc,
} from "./i18n";

// Every leaf of the dictionary, as "path -> kind" entries. Comparing these
// between locales catches a string added to one locale only, a leaf turned
// from string into function (or vice versa), and arrays that drifted in
// length — none of which should ever ship half-translated.
function leaves(value: unknown, path: string, out: Map<string, string>) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => leaves(item, `${path}[${i}]`, out));
  } else if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value).sort()) {
      leaves((value as Record<string, unknown>)[key], `${path}.${key}`, out);
    }
  } else {
    out.set(path, typeof value);
  }
}

function shape(locale: "en" | "si"): string[] {
  const out = new Map<string, string>();
  leaves(dict[locale], "dict", out);
  return [...out.entries()].map(([p, kind]) => `${p} (${kind})`);
}

describe("dict structural parity", () => {
  it("en and si expose identical nested key sets and leaf kinds", () => {
    // A failing diff here names the exact path that exists in one locale
    // but not the other (or changed kind) — add the missing translation.
    expect(shape("si")).toEqual(shape("en"));
  });

  it("parallel arrays have matching lengths", () => {
    expect(dict.si.home.steps).toHaveLength(dict.en.home.steps.length);
    expect(dict.si.home.popularChips).toHaveLength(
      dict.en.home.popularChips.length
    );
    expect(dict.si.providerReg.steps).toHaveLength(
      dict.en.providerReg.steps.length
    );
  });
});

// The Sinhala label maps for categories/districts/price types are plain
// Record<string, string>, so the type checker cannot notice when a new entry
// in constants.ts is missing its translation — these tests can.
describe("localized label coverage", () => {
  it("every category has a Sinhala label (no slug fallback)", () => {
    for (const { slug } of CATEGORIES) {
      expect(categoryLabelLoc(slug, "si"), `category "${slug}"`).not.toBe(slug);
    }
  });

  it("every district has a Sinhala label (no name fallback)", () => {
    for (const name of DISTRICTS) {
      expect(districtLabelLoc(name, "si"), `district "${name}"`).not.toBe(name);
    }
  });

  it("every price type has a Sinhala label (no value fallback)", () => {
    for (const { value } of PRICE_TYPES) {
      expect(priceTypeLabelLoc(value, "si"), `price type "${value}"`).not.toBe(
        value
      );
    }
  });
});

describe("localized label lookups", () => {
  it("returns the locale-appropriate label", () => {
    expect(categoryLabelLoc("electrician", "en")).toBe("Electrician");
    expect(categoryLabelLoc("electrician", "si")).toBe("විදුලි කාර්මික");
    expect(districtLabelLoc("Colombo", "en")).toBe("Colombo");
    expect(districtLabelLoc("Colombo", "si")).toBe("කොළඹ");
    expect(priceTypeLabelLoc("HOURLY", "en")).toBe("Per Hour");
    expect(priceTypeLabelLoc("HOURLY", "si")).toBe("පැයකට");
  });

  it("falls back to the input for unknown keys", () => {
    expect(categoryLabelLoc("unknown-trade", "si")).toBe("unknown-trade");
    expect(districtLabelLoc("Atlantis", "si")).toBe("Atlantis");
    expect(priceTypeLabelLoc("BARTER", "en")).toBe("BARTER");
  });
});
