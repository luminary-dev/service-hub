import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { storeImage, validateImage } from "@/lib/upload";

const MAX_REVIEW_PHOTOS = 3;

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3).max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(req, "review", RATE_LIMITS.review);
  if (limited) return limited;

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

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = schema.safeParse({
    rating: Number(form.get("rating")),
    comment: String(form.get("comment") ?? ""),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const files = form
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const review = await db.review.upsert({
    where: { providerId_userId: { providerId: id, userId: session.userId } },
    create: { providerId: id, userId: session.userId, ...parsed.data },
    update: parsed.data,
    include: { photos: true },
  });

  if (files.length > 0) {
    const remaining = MAX_REVIEW_PHOTOS - review.photos.length;
    if (files.length > remaining) {
      return NextResponse.json(
        {
          error: `A review can have at most ${MAX_REVIEW_PHOTOS} photos.`,
        },
        { status: 400 }
      );
    }
    for (const file of files) {
      const check = validateImage(file);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      const url = await storeImage(check.file, "reviews");
      await db.reviewPhoto.create({ data: { reviewId: review.id, url } });
    }
  }

  return NextResponse.json({ ok: true });
}
