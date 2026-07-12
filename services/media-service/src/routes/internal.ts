// Internal media API (behind the internal-secret middleware; never routed by
// the gateway). Callers own the DB rows that reference URLs; this service
// owns the bytes.
import { Hono } from "hono";
import { z } from "zod";
import {
  deleteFile,
  InvalidImageError,
  InvalidNamespaceError,
  InvalidPrefixError,
  MAX_UPLOAD_SIZE,
  sweep,
  storeFile,
} from "../lib/media";

export const internalRoutes = new Hono();

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
  const form = await c.req.formData().catch(() => null);
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
