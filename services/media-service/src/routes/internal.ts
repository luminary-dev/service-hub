// Internal media API (behind the internal-secret middleware; never routed by
// the gateway). Callers own the DB rows that reference URLs; this service
// owns the bytes.
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  deleteFile,
  InvalidImageError,
  InvalidNamespaceError,
  InvalidPrefixError,
  MAX_UPLOAD_SIZE,
  readStoredFile,
  sweep,
  storeFile,
} from "../lib/media";
import { isSupportOrAdmin } from "../lib/http";

export const internalRoutes = new Hono();

// Hard ceiling on the multipart body we will buffer, enforced as bytes stream
// in (#773). Content-Length can be spoofed or absent on a chunked request, so
// it can't be trusted to bound memory; this cap is the real backstop against an
// OOM from an oversized/hostile upload. It's the 5MB file limit plus a small
// margin for multipart framing and the namespace/prefix fields — the
// authoritative per-file check (file.size) still runs after parsing.
const MAX_BODY_SIZE = MAX_UPLOAD_SIZE + 64 * 1024;

// Reads the request body stream, aborting the moment the accumulated size
// exceeds `cap`. Returns the buffered bytes, or null when the cap is exceeded
// (the caller 413s). Unlike `c.req.formData()`, this never buffers an unbounded
// body: we count bytes as they arrive rather than trusting Content-Length.
async function readCappedBody(
  c: Context,
  cap: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  const stream = c.req.raw.body;
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// POST /internal/media/store — multipart: namespace, prefix, file. Processes
// (sharp) and stores; returns the URL to persist. 400 for a non-image.
internalRoutes.post("/internal/media/store", async (c) => {
  // Fail fast before buffering the multipart body: if the caller declares a
  // body larger than the limit, reject it now. Content-Length can be absent or
  // spoofed, so this is only an early cut-off — the post-parse file.size check
  // below is the authoritative backstop. (We're an S2S service; the gateway's
  // 6MB body cap doesn't protect us from a compromised/buggy sibling.)
  const contentLength = Number(c.req.header("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_SIZE) {
    return c.json({ error: "File too large" }, 413);
  }
  // Stream the body with a hard byte cap instead of trusting Content-Length: a
  // chunked/absent-Content-Length request skips the early cut-off above, and
  // `c.req.formData()` would then buffer the whole body before any size check
  // (#773). Read it ourselves so an oversized body is rejected mid-stream.
  const raw = await readCappedBody(c, MAX_BODY_SIZE);
  if (raw === null) return c.json({ error: "File too large" }, 413);
  const form = await new Response(raw, {
    headers: { "content-type": c.req.header("content-type") ?? "" },
  })
    .formData()
    .catch(() => null);
  const namespace = form?.get("namespace");
  const prefix = form?.get("prefix");
  const file = form?.get("file");
  if (
    typeof namespace !== "string" ||
    typeof prefix !== "string" ||
    !(file instanceof File)
  ) {
    return c.json({ error: "Invalid input" }, 400);
  }
  // Authoritative size check: the multipart body is now parsed, so this is the
  // true byte count regardless of what Content-Length claimed above. Reject
  // before handing the bytes to sharp.
  if (file.size > MAX_UPLOAD_SIZE) {
    return c.json({ error: "File too large" }, 413);
  }
  try {
    const url = await storeFile(
      namespace,
      prefix,
      Buffer.from(await file.arrayBuffer())
    );
    return c.json({ url });
  } catch (e) {
    if (e instanceof InvalidImageError) return c.json({ error: e.message }, 400);
    if (e instanceof InvalidNamespaceError || e instanceof InvalidPrefixError) {
      return c.json({ error: "Invalid input" }, 400);
    }
    throw e;
  }
});

// GET /internal/media/raw?url=/api/files/<ns>/<subpath> — streams a stored
// file's raw bytes for admin-gated callers that must NOT expose it on the
// public /files path (verification documents, #500). Behind the internal
// secret like everything here; the calling service enforces per-request authz
// (provider-service only lets ADMIN/SUPPORT reach this). PII, so it is marked
// private/no-store rather than the public immutable cache the /files route uses.
internalRoutes.get("/internal/media/raw", async (c) => {
  // Defence-in-depth for NIC PII (#773): the internal secret alone is not
  // enough on the raw endpoint — a secret-holding peer (or a leaked secret)
  // could otherwise pull every verification document by key. Require the
  // gateway-forwarded ADMIN/SUPPORT identity in ADDITION to the secret, so this
  // service enforces the same authz tier the calling route claims to, rather
  // than fully trusting provider-service. The caller must forward the
  // x-user-id / x-user-role identity headers on its S2S request.
  if (!isSupportOrAdmin(c)) return c.json({ error: "Forbidden" }, 403);
  const url = c.req.query("url");
  if (!url) return c.json({ error: "Invalid input" }, 400);
  const file = await readStoredFile(url);
  if (!file) return c.json({ error: "Not found" }, 404);
  return c.body(file.data, 200, {
    "content-type": file.contentType,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
  });
});

const deleteSchema = z.object({ url: z.string().min(1) });

// POST /internal/media/delete { url } — best-effort; always 200.
internalRoutes.post("/internal/media/delete", async (c) => {
  const parsed = deleteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  await deleteFile(parsed.data.url);
  return c.json({ ok: true });
});

const sweepSchema = z.object({
  namespace: z.string().min(1),
  referenced: z.array(z.string()),
  graceMs: z.number().int().positive().optional(),
});

// POST /internal/media/sweep { namespace, referenced[], graceMs? } — removes
// stored files no DB row references. The caller supplies the referenced set.
internalRoutes.post("/internal/media/sweep", async (c) => {
  const parsed = sweepSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  try {
    const result = await sweep(
      parsed.data.namespace,
      new Set(parsed.data.referenced),
      parsed.data.graceMs
    );
    return c.json(result);
  } catch (e) {
    if (e instanceof InvalidNamespaceError) {
      return c.json({ error: "Invalid input" }, 400);
    }
    throw e;
  }
});
