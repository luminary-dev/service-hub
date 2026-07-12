import { describe, it, expect } from "vitest";
import { isSvg } from "./image";

describe("isSvg", () => {
  it("detects .svg regardless of case", () => {
    expect(isSvg("/uploads/logo.svg")).toBe(true);
    expect(isSvg("/uploads/x.SVG")).toBe(true);
  });
  it("ignores query strings", () => {
    expect(isSvg("/api/files/provider/uploads/a.svg?v=2")).toBe(true);
  });
  it("is false for raster formats", () => {
    expect(isSvg("/uploads/a.jpg")).toBe(false);
    expect(isSvg("/api/files/provider/uploads/a.webp")).toBe(false);
  });
});
