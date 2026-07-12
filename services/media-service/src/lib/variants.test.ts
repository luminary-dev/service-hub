import { afterAll, describe, expect, it, vi } from "vitest";

// Local-disk mode (no R2 vars in tests): isolate MEDIA_DIR to a throwaway temp
// dir. media.ts reads MEDIA_DIR at module load, so set it before importing.
const MEDIA_DIR = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/media-svc-variants-test-${process.pid}-${Date.now()}`;
  process.env.MEDIA_DIR = dir;
  return dir;
});

import { readdir, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  baseUrl,
  deleteFile,
  DEFAULT_GRACE_MS,
  findOrphans,
  IMAGE_VARIANTS,
  storeFile,
  sweep,
  variantName,
  VARIANT_NAMES,
  type StoredFile,
} from "./media";

afterAll(() => rm(MEDIA_DIR, { recursive: true, force: true }));

function jpeg(width = 1000, height = 1000): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 4, g: 8, b: 12 } } })
    .jpeg()
    .toBuffer();
}

// Absolute on-disk path for a stored /api/files URL.
function diskPath(url: string): string {
  return path.join(MEDIA_DIR, url.replace("/api/files/", ""));
}

describe("variantName", () => {
  it("inserts the token before the extension", () => {
    expect(variantName("abc.jpg", "thumb")).toBe("abc.thumb.jpg");
    expect(variantName("uploads/abc.png", "medium")).toBe("uploads/abc.medium.png");
    expect(variantName("provider/uploads/abc.webp", "thumb")).toBe(
      "provider/uploads/abc.thumb.webp"
    );
  });
});

describe("baseUrl", () => {
  it("maps a variant URL back to its original", () => {
    expect(baseUrl("/api/files/provider/uploads/abc.thumb.jpg")).toBe(
      "/api/files/provider/uploads/abc.jpg"
    );
    expect(baseUrl("/api/files/provider/uploads/abc.medium.png")).toBe(
      "/api/files/provider/uploads/abc.png"
    );
  });

  it("leaves an original URL (UUID stem, no interior dot) unchanged", () => {
    const url = "/api/files/provider/uploads/8f3c-abc.jpg";
    expect(baseUrl(url)).toBe(url);
  });

  it("ignores a non-variant interior token", () => {
    const url = "/api/files/provider/uploads/abc.notavariant.jpg";
    expect(baseUrl(url)).toBe(url);
  });
});

describe("storeFile variant generation (#382)", () => {
  it("writes the original plus one file per variant, each downscaled", async () => {
    const url = await storeFile("provider", "uploads", await jpeg(1000, 1000));
    const originalWidth = (await sharp(diskPath(url)).metadata()).width;
    expect(originalWidth).toBe(1000);

    for (const v of VARIANT_NAMES) {
      const vUrl = variantName(url, v);
      const meta = await sharp(diskPath(vUrl)).metadata();
      expect(meta.width).toBe(IMAGE_VARIANTS[v]);
      expect(meta.exif).toBeUndefined();
    }
  });
});

describe("deleteFile removes variants (#382)", () => {
  it("deletes the original and every variant", async () => {
    const url = await storeFile("provider", "trash", await jpeg());
    const dir = path.dirname(diskPath(url));
    expect((await readdir(dir)).length).toBe(1 + VARIANT_NAMES.length);

    await deleteFile(url);
    const remaining = await readdir(dir).catch(() => []);
    expect(remaining).toHaveLength(0);
  });
});

describe("findOrphans is variant-aware (#382)", () => {
  const NOW = Date.parse("2026-07-13T12:00:00Z");
  const OLD = new Date(NOW - DEFAULT_GRACE_MS - 60_000);
  const original = "/api/files/provider/uploads/keep.jpg";
  const files: StoredFile[] = [
    { key: "k0", url: original, modifiedAt: OLD },
    { key: "k1", url: "/api/files/provider/uploads/keep.thumb.jpg", modifiedAt: OLD },
    { key: "k2", url: "/api/files/provider/uploads/keep.medium.jpg", modifiedAt: OLD },
    { key: "k3", url: "/api/files/provider/uploads/gone.jpg", modifiedAt: OLD },
    { key: "k4", url: "/api/files/provider/uploads/gone.thumb.jpg", modifiedAt: OLD },
  ];

  it("keeps a referenced original's variants and sweeps an orphan's", () => {
    const orphans = findOrphans(files, new Set([original]), DEFAULT_GRACE_MS, NOW);
    expect(orphans.map((f) => f.url).sort()).toEqual([
      "/api/files/provider/uploads/gone.jpg",
      "/api/files/provider/uploads/gone.thumb.jpg",
    ]);
  });
});

describe("sweep over real files keeps live variants (#382)", () => {
  it("removes an unreferenced original with its variants, keeps a referenced set", async () => {
    const keep = await storeFile("review", "reviews", await jpeg(600, 600));
    const drop = await storeFile("review", "reviews", await jpeg(600, 600));

    // Age every file past the grace window so only the referenced set survives.
    const dir = path.join(MEDIA_DIR, "review", "reviews");
    const past = new Date(Date.now() - DEFAULT_GRACE_MS - 60_000);
    for (const name of await readdir(dir)) {
      const { atime } = await stat(path.join(dir, name));
      await utimes(path.join(dir, name), atime, past);
    }

    const res = await sweep("review", new Set([keep]));
    expect(res.removed).toBe(1 + VARIANT_NAMES.length); // drop + its variants

    const remaining = await readdir(dir);
    // Only keep's original + variants remain.
    expect(remaining).toHaveLength(1 + VARIANT_NAMES.length);
    expect(remaining).toContain(path.basename(keep));
    expect(remaining).not.toContain(path.basename(drop));
  });
});
