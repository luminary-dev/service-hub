/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import { qualityChipClasses } from "@/lib/quality";
import Avatar from "@/components/Avatar";
import Stars from "@/components/Stars";
import AdminProviderActions from "@/components/admin/AdminProviderActions";
import AdminDeleteButton from "@/components/admin/AdminDeleteButton";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Moderation payload as served by `GET /api/admin/providers/:id` on the
// gateway (contact email plus reviews with hydrated reviewer names).
type AdminProviderDetail = {
  id: string;
  category: string;
  city: string;
  avatarUrl: string | null;
  verificationStatus: string;
  suspended: boolean;
  user: { name: string; email: string };
  quality: {
    qualityScore: number;
    rating: number;
    reviewCount: number;
    openReportCount: number;
  };
  reviews: {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    user: { name: string };
  }[];
  photos: { id: string; url: string; caption: string | null }[];
};

export default async function AdminProviderModeratePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

  const { id } = await params;
  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{ provider: AdminProviderDetail }>(
      `/api/admin/providers/${encodeURIComponent(id)}`
    ),
  ]);
  const provider = data?.provider ?? null;
  if (!provider) notFound();
  const t = dict[locale].admin;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/providers"
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← {t.back}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={provider.user.name} url={provider.avatarUrl} size={52} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              {provider.user.name}
            </h1>
            <p className="text-sm text-ink-500">
              {categoryLabelLoc(provider.category, locale)} · {provider.city} ·{" "}
              {provider.user.email}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`chip ${qualityChipClasses(provider.quality.qualityScore)}`}
                title={t.qualityScoreHint}
              >
                {t.qualityScoreLabel} {provider.quality.qualityScore}
              </span>
              <span className="text-xs text-ink-500">
                {t.qualityScoreBreakdown(
                  provider.quality.rating,
                  provider.quality.reviewCount,
                  provider.quality.openReportCount
                )}
              </span>
            </div>
          </div>
        </div>
        <AdminProviderActions
          providerId={provider.id}
          verified={provider.verificationStatus === "VERIFIED"}
          suspended={provider.suspended}
          role={session.role}
        />
      </div>

      <section className="card mt-8 p-6">
        <h2 className="font-semibold text-ink-900">{t.reviewsHeading}</h2>
        {provider.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">{t.noReviews}</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100">
            {provider.reviews.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-800">
                      {r.user.name}
                    </span>
                    <Stars rating={r.rating} />
                  </div>
                  <p className="mt-1 text-sm text-ink-600">{r.comment}</p>
                </div>
                <AdminDeleteButton
                  endpoint={`/api/admin/reviews/${r.id}`}
                  role={session.role}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold text-ink-900">{t.photosHeading}</h2>
        {provider.photos.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">{t.noPhotos}</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {provider.photos.map((ph) => (
              <div
                key={ph.id}
                className="overflow-hidden rounded-xl border border-ink-200"
              >
                <img
                  src={ph.url}
                  alt={ph.caption ?? "Work photo"}
                  className="aspect-square w-full object-cover"
                />
                <div className="flex items-center justify-between gap-2 p-2">
                  <span className="truncate text-xs text-ink-500">
                    {ph.caption ?? "—"}
                  </span>
                  <AdminDeleteButton
                    endpoint={`/api/admin/photos/${ph.id}`}
                    role={session.role}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
