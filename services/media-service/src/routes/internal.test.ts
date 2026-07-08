import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The store path writes to disk in local mode (no R2 vars set in tests), so
// isolate MEDIA_DIR to a throwaway temp dir. media.ts reads MEDIA_DIR at module
// load, so it MUST be set before the app/media modules are imported — hoist it.
const MEDIA_DIR = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/media-svc-internal-test-${process.pid}-${Date.now()}`;
  process.env.MEDIA_DIR = dir;
  return dir;
});

import { rm, utimes } from "node:fs/promises";
import sharp from "sharp";
import { app } from "../app";
import { MAX_UPLOAD_SIZE, resolveFilePath } from "../lib/media";

const SECRET = "dev-internal-secret";

afterAll(() => rm(MEDIA_DIR, { recursive: true, force: true }));

// Silence the request logger's noise in test output.
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Minimal valid images produced by sharp (deterministic, no fixtures on disk).
// Returned as Uint8Array so they slot straight into a File/Blob part.
async function jpeg(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer()
  );
}
async function png(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer()
  );
}
async function webp(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 4, g: 5, b: 6 } } }).webp().toBuffer()
  );
}

// A JPEG carrying EXIF, to prove the store→serve round trip strips metadata.
async function jpegWithExif(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 50, b: 50 } } })
      .jpeg()
      .withExif({ IFD0: { Software: "test-suite", ImageDescription: "sensitive-marker" } })
      .toBuffer()
  );
}

function storeForm(fields: {
  namespace?: string;
  prefix?: string;
  file?: File | string;
}): FormData {
  const form = new FormData();
  if (fields.namespace !== undefined) form.set("namespace", fields.namespace);
  if (fields.prefix !== undefined) form.set("prefix", fields.prefix);
  if (fields.file !== undefined) form.set("file", fields.file);
  return form;
}

function postStore(form: FormData, headers: Record<string, string> = { "x-internal-secret": SECRET }) {
  return app.request("/internal/media/store", { method: "POST", headers, body: form });
}

function postJson(path: string, body: unknown, headers: Record<string, string> = { "x-internal-secret": SECRET }) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// The stored url is the gateway-facing /api/files/... shape; the /files route
// (which serves the bytes) is mounted without the /api prefix.
function serveUrl(storedUrl: string): string {
  return storedUrl.replace("/api/files/", "/files/");
}
function getServed(storedUrl: string) {
  return app.request(serveUrl(storedUrl), { headers: { "x-internal-secret": SECRET } });
}

describe("internal secret enforcement", () => {
  it.each(["/internal/media/store", "/internal/media/delete", "/internal/media/sweep"])(
    "rejects %s without the internal secret",
    async (path) => {
      const res = await app.request(path, { method: "POST", headers: {} });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    }
  );

  it("rejects a wrong secret", async () => {
    const res = await postStore(storeForm({}), { "x-internal-secret": "nope" });
    expect(res.status).toBe(403);
  });
});

describe("POST /internal/media/store", () => {
  it("stores a JPEG and returns a /api/files url", async () => {
    const res = await postStore(
      storeForm({ namespace: "provider", prefix: "uploads", file: new File([await jpeg()], "x.jpg", { type: "image/jpeg" }) })
    );
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^\/api\/files\/provider\/uploads\/[0-9a-f-]{36}\.jpg$/);
  });

  it("keys the extension off the decoded format, not the upload name/type", async () => {
    // A real PNG mislabeled as .jpg / image/jpeg must be stored as .png.
    const res = await postStore(
      storeForm({ namespace: "provider", prefix: "uploads", file: new File([await png()], "lies.jpg", { type: "image/jpeg" }) })
    );
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url.endsWith(".png")).toBe(true);
  });

  it("stores WebP", async () => {
    const res = await postStore(
      storeForm({ namespace: "review", prefix: "reviews", file: new File([await webp()], "x.webp", { type: "image/webp" }) })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url.endsWith(".webp")).toBe(true);
  });

  it("re-encodes and strips EXIF end to end (store → serve)", async () => {
    const res = await postStore(
      storeForm({ namespace: "provider", prefix: "uploads", file: new File([await jpegWithExif()], "e.jpg", { type: "image/jpeg" }) })
    );
    const { url } = (await res.json()) as { url: string };

    const served = await getServed(url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(served.headers.get("cache-control")).toContain("immutable");

    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
  });

  it("rejects a non-image payload with 400", async () => {
    const res = await postStore(
      storeForm({ namespace: "provider", prefix: "uploads", file: new File([new Uint8Array(Buffer.from("<svg/>"))], "x.jpg", { type: "image/jpeg" }) })
    );
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toHaveProperty("error");
  });

  it("413s an oversized upload before touching sharp", async () => {
    const big = new File([new Uint8Array(MAX_UPLOAD_SIZE + 1)], "big.jpg", { type: "image/jpeg" });
    const res = await postStore(storeForm({ namespace: "provider", prefix: "uploads", file: big }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "File too large" });
  });

  it("400s an invalid prefix (multi-segment / traversal)", async () => {
    const res = await postStore(
      storeForm({ namespace: "provider", prefix: "a/b", file: new File([await jpeg()], "x.jpg", { type: "image/jpeg" }) })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("400s an unknown namespace", async () => {
    const res = await postStore(
      storeForm({ namespace: "evil", prefix: "uploads", file: new File([await jpeg()], "x.jpg", { type: "image/jpeg" }) })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("400s when the file part is missing", async () => {
    const res = await postStore(storeForm({ namespace: "provider", prefix: "uploads" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("400s when the file part is not a File", async () => {
    const res = await postStore(storeForm({ namespace: "provider", prefix: "uploads", file: "not-a-file" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("400s a non-multipart body (formData parse fails)", async () => {
    const res = await app.request("/internal/media/store", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": SECRET },
      body: JSON.stringify({ namespace: "provider" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });
});

describe("POST /internal/media/delete", () => {
  it("deletes a stored file (best-effort, 200) and it stops serving", async () => {
    const stored = await postStore(
      storeForm({ namespace: "provider", prefix: "uploads", file: new File([await jpeg()], "x.jpg", { type: "image/jpeg" }) })
    );
    const { url } = (await stored.json()) as { url: string };
    expect((await getServed(url)).status).toBe(200);

    const del = await postJson("/internal/media/delete", { url });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });

    expect((await getServed(url)).status).toBe(404);
  });

  it("is a no-op 200 for a url that does not exist", async () => {
    const res = await postJson("/internal/media/delete", {
      url: "/api/files/provider/uploads/does-not-exist.jpg",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("400s an invalid body", async () => {
    expect((await postJson("/internal/media/delete", {})).status).toBe(400);
    expect((await postJson("/internal/media/delete", { url: "" })).status).toBe(400);
    expect((await postJson("/internal/media/delete", "not json")).status).toBe(400);
  });
});

describe("POST /internal/media/sweep", () => {
  it("400s an invalid namespace", async () => {
    const res = await postJson("/internal/media/sweep", { namespace: "evil", referenced: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("400s an invalid body", async () => {
    expect((await postJson("/internal/media/sweep", { namespace: "provider" })).status).toBe(400);
    expect((await postJson("/internal/media/sweep", { namespace: "provider", referenced: "x" })).status).toBe(400);
    expect((await postJson("/internal/media/sweep", { namespace: "provider", referenced: [], graceMs: -1 })).status).toBe(400);
  });

  it("keeps a referenced file (removed: 0)", async () => {
    const stored = await postStore(
      storeForm({ namespace: "review", prefix: "reviews", file: new File([await jpeg()], "x.jpg", { type: "image/jpeg" }) })
    );
    const { url } = (await stored.json()) as { url: string };

    const res = await postJson("/internal/media/sweep", { namespace: "review", referenced: [url] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scanned: number; removed: number };
    expect(body.scanned).toBeGreaterThanOrEqual(1);
    expect(body.removed).toBe(0);
    expect((await getServed(url)).status).toBe(200);
  });

  it("removes an aged, unreferenced file", async () => {
    const stored = await postStore(
      storeForm({ namespace: "review", prefix: "reviews", file: new File([await png()], "old.png", { type: "image/png" }) })
    );
    const { url } = (await stored.json()) as { url: string };

    // Age the file past the (default) grace window so the sweep treats it as an
    // orphan; without this it would be protected as an in-flight upload.
    const onDisk = resolveFilePath("review", url.replace("/api/files/review/", ""));
    const past = new Date(Date.now() - 1000 * 60 * 60 * 48);
    await utimes(onDisk as string, past, past);

    const res = await postJson("/internal/media/sweep", { namespace: "review", referenced: [] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scanned: number; removed: number };
    expect(body.removed).toBeGreaterThanOrEqual(1);
    expect((await getServed(url)).status).toBe(404);
  });
});
