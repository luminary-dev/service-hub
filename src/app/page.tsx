import Link from "next/link";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/constants";
import ProviderCard, { ProviderSummary } from "@/components/ProviderCard";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [providers, providerCount, reviewCount] = await Promise.all([
    db.provider.findMany({
      include: {
        user: { select: { name: true } },
        services: { orderBy: { price: "asc" }, take: 1 },
        photos: { take: 1, orderBy: { createdAt: "desc" } },
        reviews: { select: { rating: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.provider.count(),
    db.review.count(),
  ]);

  const featured: ProviderSummary[] = providers.map((p) => ({
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

  return (
    <div>
      <section className="relative overflow-hidden bg-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 80% at 70% 20%, #ecfdf5 0%, transparent 60%), radial-gradient(40% 60% at 20% 80%, #f0fdf4 0%, transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              🇱🇰 Built for Sri Lanka
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              Skilled hands for{" "}
              <span className="text-brand-600">every job</span> at home
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500">
              From a leaking tap in Colombo to a garden makeover in Kandy —
              find trusted mechanics, electricians, designers and more. Browse
              real work photos, compare rates and contact them directly.
            </p>
            <div className="mt-8 max-w-xl">
              <SearchBar />
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-ink-500">
              <span>
                <strong className="text-ink-900">{providerCount}</strong>{" "}
                professionals
              </span>
              <span>
                <strong className="text-ink-900">{CATEGORIES.length}</strong>{" "}
                service categories
              </span>
              <span>
                <strong className="text-ink-900">{reviewCount}</strong> customer
                reviews
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink-900">
              Browse by category
            </h2>
            <p className="mt-1 text-ink-500">
              What do you need help with today?
            </p>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/providers?category=${c.slug}`}
              className="card group flex items-center gap-3 p-4 transition hover:border-brand-300 hover:bg-brand-50/50"
            >
              <span className="text-2xl">{c.icon}</span>
              <span className="text-sm font-medium text-ink-700 group-hover:text-brand-700">
                {c.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-ink-900">
                  Recently joined professionals
                </h2>
                <p className="mt-1 text-ink-500">
                  Fresh talent ready to take on your project
                </p>
              </div>
              <Link
                href="/providers"
                className="hidden text-sm font-semibold text-brand-600 hover:text-brand-700 sm:block"
              >
                View all →
              </Link>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((p) => (
                <ProviderCard key={p.id} p={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-ink-900">
          How it works
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Search & browse",
              body: "Filter by service and district. View profiles, work photos, rates and genuine customer reviews.",
            },
            {
              step: "2",
              title: "Contact directly",
              body: "Call, WhatsApp or send an inquiry straight from the profile. No middlemen, no booking fees.",
            },
            {
              step: "3",
              title: "Get it done",
              body: "Agree on the price directly with the professional. Leave a review to help the next customer.",
            },
          ].map((s) => (
            <div key={s.step} className="card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-bold text-white">
                {s.step}
              </span>
              <h3 className="mt-4 font-semibold text-ink-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-brand-900 px-6 py-14 text-center sm:px-12">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(50% 100% at 50% 0%, rgba(16,185,129,.35) 0%, transparent 70%)",
            }}
          />
          <h2 className="relative text-3xl font-bold tracking-tight text-white">
            Are you a skilled professional?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-brand-100">
            Create your free profile, showcase your work photos, set your rates
            and let customers across Sri Lanka find you.
          </p>
          <Link
            href="/register/provider"
            className="relative mt-8 inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-50"
          >
            Join as a Professional — Free
          </Link>
        </div>
      </section>
    </div>
  );
}
