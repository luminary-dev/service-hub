import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const photo = await db.reviewPhoto.findUnique({
    where: { id },
    include: { review: { select: { userId: true } } },
  });
  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // The review's author can remove their own photo; admins can moderate any.
  const isOwner = photo.review.userId === session.userId;
  const isAdmin = session.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.reviewPhoto.delete({ where: { id } });

  if (photo.url.startsWith("/uploads/") || photo.url.startsWith("/reviews/")) {
    await unlink(path.join(process.cwd(), "public", photo.url)).catch(() => {});
  } else if (process.env.BLOB_READ_WRITE_TOKEN && photo.url.startsWith("http")) {
    await del(photo.url).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
