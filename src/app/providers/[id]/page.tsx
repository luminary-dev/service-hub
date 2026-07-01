import { notFound } from "next/navigation";
import { FaLocationDot } from "react-icons/fa6";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { categoryLabel, formatLKR, priceTypeLabel } from "@/lib/constants";
import Avatar from "@/components/Avatar";
import CategoryIcon from "@/components/CategoryIcon";
import Stars from "@/components/Stars";
import PhotoGallery from "@/components/PhotoGallery";
import InquiryForm from "@/components/InquiryForm";
import ReviewSection from "@/components/ReviewSection";
import ContactLinks from "@/components/ContactLinks";

export const dynamic = "force-dynamic";

export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [provider, session] = await Promise.all([
    db.provider.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        services: { orderBy: { price: "asc" } },
        photos: { orderBy: { createdAt: "desc" } },
        reviews: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getSession(),
  ]);

  if (!provider) notFound();

  const avg = provider.reviews.length
    ? provider.reviews.reduce((s, r) => s + r.rating, 0) /
      provider.reviews.length
    : null;

  const isOwner = session?.userId === provider.userId;
  const myReview = session
    ? provider.reviews.find((r) => r.userId === session.userId) ?? null
    : null;

  return (
    <div>
      <div className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-5">
              <Avatar
                name={provider.user.name}
                url={provider.avatarUrl}
                size={88}
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                    {provider.user.name}
                  </h1>
                  {provider.available ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Available for work
                    </span>
                  ) : (
                    <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">
                      Currently unavailable
                    </span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1.5 font-medium text-brand-700">
                  <CategoryIcon slug={provider.category} className="h-4 w-4" />
                  {categoryLabel(provider.category)}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                  <FaLocationDot className="h-3.5 w-3.5 text-ink-500" />
                  {provider.city}, {provider.district}
                  {provider.experience > 0 &&
                    ` · ${provider.experience} year${provider.experience === 1 ? "" : "s"} experience`}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {avg !== null ? (
                    <>
                      <Stars rating={avg} size="md" />
                      <span className="font-semibold text-ink-800">
                        {avg.toFixed(1)}
                      </span>
                      <span className="text-sm text-ink-500">
                        ({provider.reviews.length} review
                        {provider.reviews.length === 1 ? "" : "s"})
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-ink-500">
                      No reviews yet
                    </span>
                  )}
                </div>
              </div>
            </div>
            <ContactLinks
              phone={provider.user.phone}
              whatsapp={provider.whatsapp}
              phone2={provider.phone2}
              facebook={provider.facebook}
              instagram={provider.instagram}
              tiktok={provider.tiktok}
              youtube={provider.youtube}
              website={provider.website}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section className="card p-6">
              <h2 className="text-lg font-semibold text-ink-900">About</h2>
              <p className="mt-2 font-medium text-ink-700">
                {provider.headline}
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                {provider.bio}
              </p>
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-semibold text-ink-900">
                Services & Rates
              </h2>
              {provider.services.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">
                  No services listed yet.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-ink-100">
                  {provider.services.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-start justify-between gap-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-ink-800">{s.title}</p>
                        {s.description && (
                          <p className="mt-0.5 text-sm text-ink-500">
                            {s.description}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-right">
                        <span className="font-semibold text-brand-700">
                          {formatLKR(s.price)}
                        </span>
                        <span className="block text-xs text-ink-500">
                          {priceTypeLabel(s.priceType)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-semibold text-ink-900">
                Work Photos
              </h2>
              {provider.photos.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">
                  No work photos uploaded yet.
                </p>
              ) : (
                <div className="mt-4">
                  <PhotoGallery
                    photos={provider.photos.map((p) => ({
                      id: p.id,
                      url: p.url,
                      caption: p.caption,
                    }))}
                  />
                </div>
              )}
            </section>

            <ReviewSection
              providerId={provider.id}
              reviews={provider.reviews.map((r) => ({
                id: r.id,
                rating: r.rating,
                comment: r.comment,
                createdAt: r.createdAt.toISOString(),
                userName: r.user.name,
              }))}
              canReview={!!session && !isOwner}
              signedIn={!!session}
              myReview={
                myReview
                  ? { rating: myReview.rating, comment: myReview.comment }
                  : null
              }
            />
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <InquiryForm
                providerId={provider.id}
                providerName={provider.user.name}
                defaultName={session?.name ?? ""}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
