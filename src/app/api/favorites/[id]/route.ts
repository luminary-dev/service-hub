import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  await db.favorite.upsert({
    where: { userId_providerId: { userId: session.userId, providerId: id } },
    create: { userId: session.userId, providerId: id },
    update: {},
  });

  return NextResponse.json({ favorited: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await db.favorite.deleteMany({
    where: { userId: session.userId, providerId: id },
  });

  return NextResponse.json({ favorited: false });
}
