import { describe, expect, it } from "vitest";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_SIZE,
  moveItem,
  validateUpload,
} from "./upload";

describe("validateUpload", () => {
  it("accepts every allowed type at the size limit", () => {
    for (const type of ALLOWED_IMAGE_TYPES) {
      expect(validateUpload({ type, size: MAX_UPLOAD_SIZE })).toBeNull();
    }
  });

  it("rejects disallowed types (SVG, GIF, empty)", () => {
    expect(validateUpload({ type: "image/svg+xml", size: 10 })).toBe("type");
    expect(validateUpload({ type: "image/gif", size: 10 })).toBe("type");
    expect(validateUpload({ type: "", size: 10 })).toBe("type");
  });

  it("rejects files over 5MB", () => {
    expect(
      validateUpload({ type: "image/jpeg", size: MAX_UPLOAD_SIZE + 1 })
    ).toBe("size");
  });

  it("reports the type problem before the size problem", () => {
    expect(
      validateUpload({ type: "image/gif", size: MAX_UPLOAD_SIZE + 1 })
    ).toBe("type");
  });
});

describe("moveItem", () => {
  const list = ["a", "b", "c", "d"];

  it("moves an item forward", () => {
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward", () => {
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns an equal copy for same-index and out-of-range moves", () => {
    expect(moveItem(list, 1, 1)).toEqual(list);
    expect(moveItem(list, -1, 2)).toEqual(list);
    expect(moveItem(list, 0, 4)).toEqual(list);
  });

  it("does not mutate the input", () => {
    moveItem(list, 0, 3);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });
});
