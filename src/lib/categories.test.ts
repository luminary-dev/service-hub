import { describe, expect, it } from "vitest";
import { categoryOptionLabel, STATIC_CATEGORY_OPTIONS } from "./categories";
import { CATEGORIES } from "./constants";

describe("STATIC_CATEGORY_OPTIONS", () => {
  it("mirrors the static CATEGORIES list", () => {
    expect(STATIC_CATEGORY_OPTIONS.map((o) => o.slug)).toEqual(
      CATEGORIES.map((c) => c.slug)
    );
  });

  it("carries both language labels for every option", () => {
    // The fallback options must be fully bilingual: if provider-service is
    // down, the Sinhala UI still needs Sinhala category names.
    for (const option of STATIC_CATEGORY_OPTIONS) {
      expect(option.labelEn, option.slug).toBeTruthy();
      expect(option.labelSi, option.slug).toBeTruthy();
      expect(option.labelSi, option.slug).not.toBe(option.slug);
    }
  });
});

describe("categoryOptionLabel", () => {
  const option = STATIC_CATEGORY_OPTIONS.find((o) => o.slug === "electrician")!;

  it("returns the label for the requested locale", () => {
    expect(categoryOptionLabel(option, "en")).toBe("Electrician");
    expect(categoryOptionLabel(option, "si")).toBe("විදුලි කාර්මික");
  });
});
