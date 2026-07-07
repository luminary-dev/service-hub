/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import Avatar from "@/components/Avatar";
import Stars from "@/components/Stars";
import InView from "@/components/InView";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
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
  if (session.role !== "ADMIN") redirect("/");

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
    <div>
      {/* Breadcrumb / spec strip */}
      <div className="border-b border-ink-300 bg-ink-100">
        <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
          <Link
            href="/admin/providers"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            ← {t.back}
          </Link>
        </div>
      </div>

      <PageHeader
        tag="PRV"
        eyebrow={categoryLabelLoc(provider.category, locale)}
        title={
          <span className="flex items-center gap-4">
            <Avatar
              name={provider.user.name}
              url={provider.avatarUrl}
              size={52}
            />
            {provider.user.name}
          </span>
        }
        status={
          <>
            {provider.city}
            <span aria-hidden className="text-ink-300">
              ·
            </span>
            {provider.user.email}
          </>
        }
      >
        <div className="flex flex-col items-start gap-4 sm:items-end">
          <StatReadout
            stats={[
              { label: t.reviewsHeading, value: provider.reviews.length },
              { label: t.photosHeading, value: provider.photos.length },
            ]}
          />
          <AdminProviderActions
            providerId={provider.id}
            verified={provider.verificationStatus === "VERIFIED"}
            suspended={provider.suspended}
          />
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {/* Reviews panel */}
        <section className="tech-corners border border-ink-300 bg-surface">
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
              {t.reviewsHeading}
            </h2>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
              <span className="tabular-nums text-ink-600">
                {provider.reviews.length}
              </span>
            </span>
          </div>
          {provider.reviews.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-500">{t.noReviews}</p>
          ) : (
            <InView
              as="ul"
              stagger
              className="divide-y divide-dashed divide-ink-200"
            >
              {provider.reviews.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-800">
                        {r.user.name}
                      </span>
                      <Stars rating={r.rating} />
                    </div>
                    <p className="mt-1 text-sm text-ink-600">{r.comment}</p>
                  </div>
                  <AdminDeleteButton endpoint={`/api/admin/reviews/${r.id}`} />
                </li>
              ))}
            </InView>
          )}
        </section>

        {/* Work-photos panel */}
        <section className="tech-corners border border-ink-300 bg-surface">
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
              {t.photosHeading}
            </h2>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
              <span className="tabular-nums text-ink-600">
                {provider.photos.length}
              </span>
            </span>
          </div>
          {provider.photos.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-500">{t.noPhotos}</p>
          ) : (
            <InView
              stagger
              className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3"
            >
              {provider.photos.map((ph) => (
                <div
                  key={ph.id}
                  className="overflow-hidden border border-ink-300 bg-ink-100"
                >
                  <img
                    src={ph.url}
                    alt={ph.caption ?? "Work photo"}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-ink-300 px-2 py-1.5">
                    <span className="truncate font-mono text-[10px] uppercase tracking-wider text-ink-500">
                      {ph.caption ?? "—"}
                    </span>
                    <AdminDeleteButton endpoint={`/api/admin/photos/${ph.id}`} />
                  </div>
                </div>
              ))}
            </InView>
          )}
        </section>
      </div>
    </div>
  );
}
