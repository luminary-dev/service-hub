import { describe, expect, it } from "vitest";
import { FaScrewdriverWrench, FaWrench } from "@/components/icons";
import {
  CATEGORIES,
  categoryIcon,
  categoryLabel,
  DISTRICTS,
  priceTypeLabel,
} from "./constants";

describe("categoryLabel", () => {
  it("resolves a known slug", () => {
    expect(categoryLabel("mechanic")).toBe("Mechanic");
    expect(categoryLabel("garden-designer")).toBe("Garden Designer");
  });

  it("falls back to the slug for unknown categories", () => {
    // Managed categories (#135) can introduce slugs the static list doesn't
    // know; the UI shows the slug rather than crashing or showing blank.
    expect(categoryLabel("solar-installer")).toBe("solar-installer");
  });
});

describe("categoryIcon", () => {
  it("resolves a known slug", () => {
    expect(categoryIcon("mechanic")).toBe(FaWrench);
  });

  it("falls back to the generic tool icon for unknown slugs", () => {
    expect(categoryIcon("solar-installer")).toBe(FaScrewdriverWrench);
  });
});

describe("priceTypeLabel", () => {
  it("resolves every known price type", () => {
    expect(priceTypeLabel("HOURLY")).toBe("Per Hour");
    expect(priceTypeLabel("DAILY")).toBe("Per Day");
    expect(priceTypeLabel("FIXED")).toBe("Fixed Price");
    expect(priceTypeLabel("VISIT")).toBe("Per Visit");
  });

  it("falls back to the raw value for unknown types", () => {
    expect(priceTypeLabel("BARTER")).toBe("BARTER");
  });
});

describe("static data integrity", () => {
  it("category slugs are unique and URL-safe", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("districts are unique and alphabetically ordered", () => {
    expect(new Set(DISTRICTS).size).toBe(DISTRICTS.length);
    expect([...DISTRICTS]).toEqual([...DISTRICTS].sort());
  });
});
