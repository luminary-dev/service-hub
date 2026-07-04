import { describe, it, expect } from "vitest";
import { validateImage, MAX_UPLOAD_SIZE } from "./storage";

function makeFile(type: string, size = 10): File {
  return new File([new Uint8Array(size)], `test.${type.split("/")[1]}`, { type });
}

describe("validateImage", () => {
  it("accepts jpeg, png and webp under the size limit", () => {
    expect(validateImage(makeFile("image/jpeg"))).toBeNull();
    expect(validateImage(makeFile("image/png"))).toBeNull();
    expect(validateImage(makeFile("image/webp"))).toBeNull();
  });

  it("rejects disallowed types", () => {
    expect(validateImage(makeFile("image/gif"))).toBe(
      "Only JPEG, PNG or WebP images are allowed"
    );
    expect(validateImage(makeFile("application/pdf"))).toBe(
      "Only JPEG, PNG or WebP images are allowed"
    );
    expect(validateImage(makeFile("text/plain"))).toBe(
      "Only JPEG, PNG or WebP images are allowed"
    );
  });

  it("rejects files over 5MB", () => {
    expect(validateImage(makeFile("image/jpeg", MAX_UPLOAD_SIZE + 1))).toBe(
      "Image must be under 5MB"
    );
  });

  it("accepts a file exactly at the size limit", () => {
    expect(validateImage(makeFile("image/png", MAX_UPLOAD_SIZE))).toBeNull();
  });
});

