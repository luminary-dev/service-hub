import Link from "next/link";
import { redirect } from "next/navigation";
import { FaRegHeart } from "react-icons/fa6";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import ProviderCard, { ProviderSummary } from "@/components/ProviderCard";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [locale, favorites] = await Promise.all([
    getLocale(),
    db.favorite.findMany({
      where: { userId: session.userId, provider: { suspended: false } },
      orderBy: { createdAt: "desc" },
      include: {
        provider: {
          include: {
            user: { select: { name: true } },
            services: { orderBy: { price: "asc" }, take: 1 },
            photos: { take: 1, orderBy: { createdAt: "desc" } },
            reviews: { select: { rating: true } },
          },
        },
      },
    }),
  ]);
  const t = dict[locale];

  const results: ProviderSummary[] = favorites.map(({ provider: p }) => ({
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
    verified: p.verificationStatus === "VERIFIED",
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.account.title}
      </h1>
      <p className="mt-1 text-ink-600">{t.account.subtitle}</p>

      {results.length === 0 ? (
        <div className="card mt-8 flex flex-col items-center px-6 py-20 text-center">
          <FaRegHeart className="h-12 w-12 text-ink-300" />
          <p className="mt-4 max-w-sm text-sm text-ink-500">
            {t.account.empty}
          </p>
          <Link href="/providers" className="btn-primary mt-6">
            {t.account.emptyCta}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProviderCard
              key={p.id}
              p={p}
              locale={locale}
              showFavorite
              favorited
            />
          ))}
        </div>
      )}
    </div>
  );
}
