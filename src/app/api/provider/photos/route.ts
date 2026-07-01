import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider-auth";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const caption = form?.get("caption");
  const kind = form?.get("kind");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG and WebP images are allowed" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Image must be under 5MB" },
      { status: 400 }
    );
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${EXT[file.type]}`;
  await writeFile(
    path.join(dir, filename),
    Buffer.from(await file.arrayBuffer())
  );
  const url = `/uploads/${filename}`;

  if (kind === "avatar") {
    await db.provider.update({
      where: { id: provider.id },
      data: { avatarUrl: url },
    });
    return NextResponse.json({ avatarUrl: url });
  }

  const photo = await db.workPhoto.create({
    data: {
      providerId: provider.id,
      url,
      caption: typeof caption === "string" && caption ? caption : null,
    },
  });

  return NextResponse.json({ photo });
}
