import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const category = params.get("category");
  const district = params.get("district");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = 12;

  const where = {
    suspended: false,
    ...(category ? { category } : {}),
    ...(district ? { district } : {}),
    ...(q
      ? {
          OR: [
            { headline: { contains: q } },
            { bio: { contains: q } },
            { city: { contains: q } },
            { user: { name: { contains: q } } },
            { services: { some: { title: { contains: q } } } },
          ],
        }
      : {}),
  };

  const [providers, total] = await Promise.all([
    db.provider.findMany({
      where,
      include: {
        user: { select: { name: true } },
        services: { orderBy: { price: "asc" }, take: 1 },
        photos: { take: 1, orderBy: { createdAt: "desc" } },
        reviews: { select: { rating: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.provider.count({ where }),
  ]);

  const results = providers.map((p) => ({
    id: p.id,
    name: p.user.name,
    category: p.category,
    headline: p.headline,
    district: p.district,
    city: p.city,
    experience: p.experience,
    available: p.available,
    avatarUrl: p.avatarUrl,
    coverPhoto: p.photos[0]?.url ?? null,
    fromPrice: p.services[0]?.price ?? null,
    fromPriceType: p.services[0]?.priceType ?? null,
    rating: p.reviews.length
      ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length
      : null,
    reviewCount: p.reviews.length,
  }));

  return NextResponse.json({ providers: results, total, page, pageSize });
}
