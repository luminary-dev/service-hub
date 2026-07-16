import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Local-disk mode (no R2 vars in tests): isolate MEDIA_DIR to a throwaway temp
// dir. media.ts reads MEDIA_DIR at module load, so set it before importing.
const MEDIA_DIR = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/media-svc-files-test-${process.pid}-${Date.now()}`;
  process.env.MEDIA_DIR = dir;
  return dir;
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { app } from "../app";
import { storeFile } from "../lib/media";
import * as r2 from "../lib/r2";

const SECRET = "dev-internal-secret";

afterAll(() => rm(MEDIA_DIR, { recursive: true, force: true }));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function jpeg(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .jpeg()
    .toBuffer();
}

function get(path: string, headers: Record<string, string> = { "x-internal-secret": SECRET }) {
  return app.request(path, { headers });
}

// Seed a file directly through the lib (bypassing the store route) and return
// the /files-mounted path that serves it. `width` controls the original size so
// variant downscaling is observable.
async function seed(width = 8): Promise<string> {
  const url = await storeFile("provider", "uploads", await jpeg(width, width));
  return url.replace("/api/files/", "/files/");
}

describe("GET /healthz", () => {
  it("responds without the internal secret", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "media-service" });
  });
});

describe("GET /files/:namespace/*", () => {
  it("requires the internal secret", async () => {
    const res = await app.request("/files/provider/uploads/x.jpg", { headers: {} });
    expect(res.status).toBe(403);
  });

  it("serves a stored image with the right content-type and cache headers", async () => {
    const path = await seed();
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("serves with anti-sniffing headers (nosniff + inline disposition)", async () => {
    const path = await seed();
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe("inline");
  });

  it("404s an unsupported extension without hitting disk", async () => {
    const res = await get("/files/provider/uploads/secret.txt");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("404s a missing file", async () => {
    const res = await get("/files/provider/uploads/nope.jpg");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("404s an unknown namespace", async () => {
    const res = await get("/files/evil/uploads/x.jpg");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("404s a path-traversal attempt that keeps an image extension", async () => {
    const res = await get("/files/provider/uploads/..%2f..%2f..%2fsecret.jpg");
    expect(res.status).toBe(404);
  });

  it("404s a verification document even though the bytes exist (#500)", async () => {
    // Verification PII is served ONLY through provider-service's admin-gated
    // route; the public /files path must refuse it regardless of the file
    // existing on disk.
    const url = await storeFile("provider", "verification", await jpeg());
    const res = await get(url.replace("/api/files/", "/files/"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("404s a verification document reached via an encoded-traversal subpath (#741)", async () => {
    // The PII gate must key off the NORMALIZED path: a raw first-segment check
    // is bypassed by `uploads/../verification/...`, whose first segment is the
    // innocent `uploads` but which resolves into the reserved prefix on disk.
    const url = await storeFile("provider", "verification", await jpeg());
    const file = url.split("/").pop(); // <uuid>.jpg
    const res = await get(
      `/files/provider/uploads%2F..%2Fverification%2F${file}`
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

// R2 backend failure handling (#765). These stub the r2 module so the route
// takes the R2 branch without any real bucket/credentials.
describe("GET /files/:namespace/* — R2 backend errors (#765)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("503s (not 404s) when an R2 read fails with a non-missing error", async () => {
    vi.spyOn(r2, "r2Enabled").mockReturnValue(true);
    // A real outage: endpoint unreachable / expired keys / throttling — r2Get
    // rethrows, so the route must surface it as a 5xx, not mask it as 404.
    vi.spyOn(r2, "r2Get").mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), { name: "TimeoutError" })
    );
    const res = await get("/files/provider/uploads/anything.jpg");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Storage unavailable" });
  });

  it("still 404s a genuinely missing object (r2Get returns null)", async () => {
    vi.spyOn(r2, "r2Enabled").mockReturnValue(true);
    vi.spyOn(r2, "r2Get").mockResolvedValue(null);
    const res = await get("/files/provider/uploads/missing.jpg");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("GET /files/:namespace/* variants (#382)", () => {
  it("serves a smaller variant than the original for ?variant=thumb", async () => {
    const path = await seed(1000); // original wider than thumb (400)
    const original = await get(path);
    const thumb = await get(`${path}?variant=thumb`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/jpeg");
    const [origMeta, thumbMeta] = await Promise.all([
      sharp(Buffer.from(await original.arrayBuffer())).metadata(),
      sharp(Buffer.from(await thumb.arrayBuffer())).metadata(),
    ]);
    expect(origMeta.width).toBe(1000);
    expect(thumbMeta.width).toBe(400);
  });

  it("serves the medium variant at its width", async () => {
    const path = await seed(1000);
    const res = await get(`${path}?variant=medium`);
    expect(res.status).toBe(200);
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(800);
  });

  it("ignores an unknown variant and serves the original", async () => {
    const path = await seed(1000);
    const res = await get(`${path}?variant=nope`);
    expect(res.status).toBe(200);
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(1000);
  });

  it("falls back to the original when the variant is missing (pre-#382 upload)", async () => {
    // Simulate a legacy upload: write only the original, no variants.
    const dir = `${MEDIA_DIR}/provider/legacy`;
    await mkdir(dir, { recursive: true });
    const buf = await jpeg(500, 500);
    await writeFile(`${dir}/old.jpg`, buf);
    const res = await get("/files/provider/legacy/old.jpg?variant=thumb");
    expect(res.status).toBe(200);
    // No thumb exists, so the bytes are the untouched original (still 500 wide).
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(500);
  });
});
