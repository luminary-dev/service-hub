import { describe, it, expect } from "vitest";
import { qualityChipClasses } from "./quality";

describe("qualityChipClasses", () => {
  it("uses the emerald (green) treatment at 80 and above", () => {
    expect(qualityChipClasses(80)).toContain("emerald");
    expect(qualityChipClasses(100)).toContain("emerald");
  });

  it("uses the amber (yellow) treatment between 50 and 79", () => {
    expect(qualityChipClasses(50)).toContain("amber");
    expect(qualityChipClasses(79)).toContain("amber");
  });

  it("uses the red treatment below 50", () => {
    expect(qualityChipClasses(49)).toContain("red");
    expect(qualityChipClasses(0)).toContain("red");
  });
});
