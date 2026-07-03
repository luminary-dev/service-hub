// Serves locally-stored uploads from $UPLOAD_DIR (public through the gateway
// as /api/files/provider/*). Only image extensions we ever store are served.
import { Hono } from "hono";
import { readFile } from "fs/promises";
import path from "path";
import { resolveFilePath } from "../lib/storage";

export const filesRoutes = new Hono();

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

filesRoutes.get("/files/*", async (c) => {
  const rel = decodeURIComponent(c.req.path.slice("/files/".length));
  const ext = path.extname(rel).slice(1).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return c.json({ error: "Not found" }, 404);
  }

  const filePath = resolveFilePath(rel);
  if (!filePath) {
    return c.json({ error: "Not found" }, 404);
  }

  try {
    const data = await readFile(filePath);
    return c.body(new Uint8Array(data), 200, { "content-type": contentType });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});
