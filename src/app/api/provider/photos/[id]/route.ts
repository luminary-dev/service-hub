import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider-auth";

async function removeStoredFile(url: string) {
  if (url.startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), "public", url);
    await unlink(filePath).catch(() => {});
  } else if (process.env.BLOB_READ_WRITE_TOKEN && url.startsWith("http")) {
    await del(url).catch(() => {});
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const photo = await db.workPhoto.findUnique({ where: { id } });
  if (!photo || photo.providerId !== provider.id) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  await db.workPhoto.delete({ where: { id } });
  await removeStoredFile(photo.url);

  return NextResponse.json({ ok: true });
}
