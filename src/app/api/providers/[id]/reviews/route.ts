import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3).max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to leave a review" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }
  if (provider.userId === session.userId) {
    return NextResponse.json(
      { error: "You cannot review your own profile" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const review = await db.review.upsert({
    where: { providerId_userId: { providerId: id, userId: session.userId } },
    create: { providerId: id, userId: session.userId, ...parsed.data },
    update: parsed.data,
    include: { user: { select: { name: true } } },
  });

  return NextResponse.json({ review });
}
