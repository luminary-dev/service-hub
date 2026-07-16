// Serves stored uploads (public through the gateway as /api/files/<namespace>/*).
// Only the image extensions we store are served. Bytes come from R2 (private
// bucket, streamed here) or local disk.
import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  isKnownNamespace,
  isVariantName,
  isVerificationSubpath,
  normalizeSubpath,
  resolveFilePath,
  variantName,
} from "../lib/media";
import { r2Enabled, r2Get } from "../lib/r2";
import { log } from "../lib/log";

export const filesRoutes = new Hono();

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// UUID-named files never change, so cache them hard.
const CACHE_CONTROL = "public, max-age=31536000, immutable";

// /files/<namespace>/<subpath>
filesRoutes.get("/files/:namespace/*", async (c) => {
  const namespace = c.req.param("namespace");
  // Normalize the decoded subpath up front (#741): every downstream decision —
  // the PII gate, the R2 key, and the disk resolver — must see the collapsed
  // path, so a traversal like `uploads/../verification/<uuid>.jpg` can't slip
  // past the verification gate while still resolving into the reserved prefix.
  const rest = normalizeSubpath(
    decodeURIComponent(c.req.path.slice(`/files/${namespace}/`.length))
  );
  const ext = path.extname(rest).slice(1).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return c.json({ error: "Not found" }, 404);
  }

  // Verification documents (NIC / business-registration scans, #500) are PII
  // and are served ONLY through provider-service's admin-gated route, never on
  // this public path. The gateway no longer forwards this prefix; refusing it
  // here too is defence-in-depth.
  if (isVerificationSubpath(rest)) {
    return c.json({ error: "Not found" }, 404);
  }

  // Resized-variant request (#382): `?variant=thumb|medium`. The variant is a
  // separate object/file named `<uuid>.<variant>.<ext>`, so try it first and
  // fall back to the original if it's absent (pre-#382 uploads have no
  // variants) — the caller always holds the original's URL. An unknown/invalid
  // variant value is ignored and the original is served. Same format either
  // way, so the content-type derived from the URL extension still applies.
  const variant = c.req.query("variant");
  const candidates =
    variant && isVariantName(variant) ? [variantName(rest, variant), rest] : [rest];

  const headers = {
    "content-type": contentType,
    "cache-control": CACHE_CONTROL,
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
  };

  // R2: stream the object straight from the private bucket.
  if (r2Enabled()) {
    if (!isKnownNamespace(namespace)) {
      return c.json({ error: "Not found" }, 404);
    }
    try {
      for (const candidate of candidates) {
        const obj = await r2Get(`${namespace}/${candidate}`);
        if (obj) {
          return c.body(new Uint8Array(obj.body), 200, {
            ...headers,
            "content-type": obj.contentType ?? contentType,
          });
        }
      }
      return c.json({ error: "Not found" }, 404);
    } catch (err) {
      // r2Get returns null only for a genuinely missing object; any other S3
      // error (endpoint unreachable, expired keys, bucket misconfig) is
      // rethrown (#765). Surface it as 503 — NOT 404 — so an R2 outage is
      // observable in monitoring and the negative is not cached as "missing".
      log.error("r2 read failed serving /files", { namespace, err });
      return c.json({ error: "Storage unavailable" }, 503);
    }
  }

  // Local disk (traversal-guarded).
  for (const candidate of candidates) {
    const filePath = resolveFilePath(namespace, candidate);
    if (!filePath) continue;
    try {
      const data = await readFile(filePath);
      return c.body(new Uint8Array(data), 200, headers);
    } catch {
      // missing — try the next candidate (variant → original fallback)
    }
  }
  return c.json({ error: "Not found" }, 404);
});
