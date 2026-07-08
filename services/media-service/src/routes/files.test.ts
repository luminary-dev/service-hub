import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Local-disk mode (no R2 vars in tests): isolate MEDIA_DIR to a throwaway temp
// dir. media.ts reads MEDIA_DIR at module load, so set it before importing.
const MEDIA_DIR = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/media-svc-files-test-${process.pid}-${Date.now()}`;
  process.env.MEDIA_DIR = dir;
  return dir;
});

import { rm } from "node:fs/promises";
import sharp from "sharp";
import { app } from "../app";
import { storeFile } from "../lib/media";

const SECRET = "dev-internal-secret";

afterAll(() => rm(MEDIA_DIR, { recursive: true, force: true }));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function jpeg(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .jpeg()
    .toBuffer();
}

function get(path: string, headers: Record<string, string> = { "x-internal-secret": SECRET }) {
  return app.request(path, { headers });
}

// Seed a file directly through the lib (bypassing the store route) and return
// the /files-mounted path that serves it.
async function seed(): Promise<string> {
  const url = await storeFile("provider", "uploads", await jpeg());
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
});
