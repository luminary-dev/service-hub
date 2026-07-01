import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider-auth";

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

  if (photo.url.startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), "public", photo.url);
    await unlink(filePath).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
