import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const photo = await db.workPhoto.findUnique({ where: { id } });
  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  await db.workPhoto.delete({ where: { id } });

  if (photo.url.startsWith("/uploads/")) {
    await unlink(path.join(process.cwd(), "public", photo.url)).catch(() => {});
  } else if (process.env.BLOB_READ_WRITE_TOKEN && photo.url.startsWith("http")) {
    await del(photo.url).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
