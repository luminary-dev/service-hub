import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { InvalidImageError, processImage } from "./media";

async function jpegWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Software: "test-suite", ImageDescription: "sensitive-marker" },
    })
    .toBuffer();
}

describe("processImage", () => {
  it("re-encodes a JPEG and strips its EXIF metadata", async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const { data, ext } = await processImage(input);
    expect(ext).toBe("jpg");
    const meta = await sharp(data).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
  });

  it("detects the real format regardless of what the caller claims", async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const { ext } = await processImage(png);
    expect(ext).toBe("png");
  });

  it("handles webp", async () => {
    const webp = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .webp()
      .toBuffer();
    expect((await processImage(webp)).ext).toBe("webp");
  });

  it("rejects non-image payloads", async () => {
    await expect(processImage(Buffer.from("<script>alert(1)</script>"))).rejects.toThrow(
      InvalidImageError
    );
  });

  it("rejects image formats outside the allowlist", async () => {
    const gif = Buffer.from("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b", "hex");
    await expect(processImage(gif)).rejects.toThrow(InvalidImageError);
  });

  it("downscales to the requested width when given one (#382)", async () => {
    const big = await sharp({
      create: { width: 1000, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const { data } = await processImage(big, 400);
    const meta = await sharp(data).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(240); // aspect ratio preserved
  });

  it("never upscales a smaller original (withoutEnlargement)", async () => {
    const small = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const { data } = await processImage(small, 400);
    expect((await sharp(data).metadata()).width).toBe(100);
  });

  it("strips EXIF from a resized variant too", async () => {
    const withExif = await sharp({
      create: { width: 900, height: 900, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .jpeg()
      .withExif({ IFD0: { Software: "test-suite" } })
      .toBuffer();
    const { data } = await processImage(withExif, 400);
    expect((await sharp(data).metadata()).exif).toBeUndefined();
  });
});
