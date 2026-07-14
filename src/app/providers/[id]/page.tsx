import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FaLocationDot } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession, type SessionPayload } from "@/lib/auth";
import { formatDate, formatLKR } from "@/lib/format";
import {
  dict,
  bilingualText,
  categoryLabelLoc,
  districtLabelLoc,
  priceTypeLabelLoc,
} from "@/lib/i18n";
import { languageAlternates } from "@/lib/links";
import { getLocale, getUrlLocale } from "@/lib/locale";
import { providerJsonLd, siteOpenGraph } from "@/lib/seo";
import Avatar from "@/components/Avatar";
import CategoryIcon from "@/components/CategoryIcon";
import Stars from "@/components/Stars";
import PhotoGallery from "@/components/PhotoGallery";
import InquiryForm from "@/components/InquiryForm";
import ReviewSection from "@/components/ReviewSection";
import ContactLinks from "@/components/ContactLinks";
import FavoriteButton from "@/components/FavoriteButton";
import ReportButton from "@/components/ReportButton";
import ShareButton from "@/components/ShareButton";
import StaticLocationMap from "@/components/StaticLocationMap";
import VerifiedBadge from "@/components/VerifiedBadge";
import InView from "@/components/InView";
import JsonLd from "@/components/JsonLd";
import StatReadout, { type Stat } from "@/components/ui/StatReadout";
import type { ReactNode } from "react";

// A blueprint "spec panel": a `.card` fronted by a mono code tag and a
// hairline rule, then the localized section heading — the same registry
// language the ProviderCard uses, so the click-through reads as one system.
function SpecSection({
  code,
  title,
  children,
}: {
  code: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
          {code}
        </span>
        <span className="h-px flex-1 bg-ink-200" />
      </div>
      <h2 className="mt-3 text-lg font-semibold text-ink-900">{title}</h2>
      {children}
    </section>
  );
}

// Profile payload as served by `GET /api/providers/:id/full` on the gateway.
// Suspended profiles come back 404 for everyone but admins; dates are ISO
// strings; reviews arrive newest-first with reviewer names hydrated.
type FullReview = {
  id: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
  user: { name: string };
  photos: { id: string; url: string }[];
  // Provider's public reply (#395); optional so cached pre-#395 payloads parse.
  response?: { text: string; createdAt: string } | null;
};

type FullProvider = {
  id: string;
  // Owner identity (#655): the API only includes this when the viewer is the
  // owner (their own id) or an admin — anonymous/third-party payloads omit it,
  // so the owner check below is false for everyone but the owner.
  userId?: string;
  category: string;
  headline: string;
  bio: string;
  // Optional Sinhala variants (#515); rendered under the `si` locale with an
  // English fallback via bilingualText. Optional on the type so consumers need
  // no churn.
  headlineSi?: string | null;
  bioSi?: string | null;
  district: string;
  // Multi-district service area (#502); always includes `district`. Optional
  // on the type so cached pre-#502 payloads need no churn.
  serviceDistricts?: string[];
  city: string;
  // Optional map pin (#48): the API includes the pair only when the provider
  // set one, so presence of both means "show the mini-map".
  latitude?: number;
  longitude?: number;
  experience: number;
  // `available` is the EFFECTIVE availability (the service folds the away
  // window in); `awayUntil` is set while the provider is on leave (#49).
  available: boolean;
  awayUntil: string | null;
  suspended: boolean;
  verificationStatus: string;
  avatarUrl: string | null;
  // Phone numbers AND the email are withheld from the public payload
  // (#64/#655): we only learn whether each exists, then reveal the real values
  // on demand via ContactLinks.
  hasPhone: boolean;
  hasWhatsapp: boolean;
  hasPhone2: boolean;
  hasEmail: boolean;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  website: string | null;
  user: { name: string };
  services: {
    id: string;
    title: string;
    description: string | null;
    price: number;
    priceType: string;
  }[];
  photos: { id: string; url: string; caption: string | null }[];
  reviews: FullReview[];
};

// Caching (#57): public-but-fresh, split by viewer. Anonymous traffic (the
// vast majority — search engines and logged-out browsing) reads the profile
// from the Data Cache with a 60-second revalidate: reviews and the
// away/availability chip can be at most a minute stale, which is defensible
// for a directory profile. Signed-in requests bypass the cache entirely: the
// viewer may have just posted a review or sent an inquiry and must see the
// result immediately, and admins need the cookie-authenticated fetch to view
// suspended profiles at all. Both calls are memoized within a request, so
// generateMetadata and the page share one gateway hit.
function fetchProvider(id: string, session: SessionPayload | null) {
  const path = `/api/providers/${encodeURIComponent(id)}/full`;
  return session
    ? apiJson<{ provider: FullProvider }>(path)
    : apiJson<{ provider: FullProvider }>(path, { revalidate: 60 });
}

// Aggregated rating summary over ALL of a provider's reviews (#528): overall
// average+count, per-dimension averages and the 5→1 star distribution. Read
// straight from review-service's public reviews endpoint (no provider-service
// change) — `?take=1` because we only need the summary, not another page of
// reviews (those already arrive via /full). Same viewer-split caching as the
// profile itself; degrades to null so the breakdown just hides.
type ReviewSummary = {
  rating: number;
  count: number;
  dimensions: {
    quality: number | null;
    punctuality: number | null;
    value: number | null;
    communication: number | null;
  };
  distribution: Record<string, number>;
};

function fetchReviewSummary(id: string, session: SessionPayload | null) {
  const path = `/api/providers/${encodeURIComponent(id)}/reviews?take=1`;
  return session
    ? apiJson<{ summary: ReviewSummary }>(path)
    : apiJson<{ summary: ReviewSummary }>(path, { revalidate: 60 });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [locale, urlLocale, session] = await Promise.all([
    getLocale(),
    getUrlLocale(),
    getSession(),
  ]);
  const data = await fetchProvider(id, session);
  const provider = data?.provider;
  if (!provider || provider.suspended) return {};

  const category = categoryLabelLoc(provider.category, locale);
  const title = `${provider.user.name} — ${category}`;
  const description = dict[locale].meta.providerDesc(
    provider.user.name,
    category,
    provider.city
  );
  const path = `/providers/${encodeURIComponent(id)}`;
  // The opengraph-image.tsx sibling supplies the preview image automatically.
  return {
    title,
    description,
    // hreflang pair (#67): en at /providers/:id, si at /si/providers/:id.
    alternates: languageAlternates(path, urlLocale),
    // Spread over the site defaults so og:url/og:locale/og:siteName match the
    // canonical (#379); this page's own text and type stay on top.
    openGraph: {
      ...siteOpenGraph(locale, urlLocale, path),
      title,
      description,
      type: "profile",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, locale, urlLocale] = await Promise.all([
    getSession(),
    getLocale(),
    getUrlLocale(),
  ]);
  const data = await fetchProvider(id, session);
  const provider = data?.provider ?? null;

  // The service already 404s suspended profiles for non-admins; the local
  // check is defense in depth (admins moderate via /admin).
  if (!provider) notFound();
  if (provider.suspended && session?.role !== "ADMIN") notFound();
  const t = dict[locale];

  const avg = provider.reviews.length
    ? provider.reviews.reduce((s, r) => s + r.rating, 0) /
      provider.reviews.length
    : null;

  const isOwner = session?.userId === provider.userId;
  const myReview = session
    ? provider.reviews.find((r) => r.userId === session.userId) ?? null
    : null;
  // Customers can save any profile but their own.
  const canFavorite = !!session && !isOwner;
  let favorited = false;
  if (canFavorite) {
    const favorites = await apiJson<{ providerIds: string[] }>(
      "/api/favorites"
    );
    favorited = favorites?.providerIds.includes(provider.id) ?? false;
  }

  // Rating breakdown/distribution over all reviews (#528) — read directly from
  // review-service, independent of the profile's first review page.
  const reviewData = await fetchReviewSummary(provider.id, session);
  const reviewSummary = reviewData?.summary ?? null;

  // Headline rating/count must reflect ALL reviews, not the first page. `/full`
  // only carries the newest FULL_REVIEWS_TAKE (50), so `provider.reviews`
  // undercounts and skews `avg` for prolific providers (#548). Prefer the #528
  // aggregate; fall back to the first-page values only if the summary fetch
  // failed (so the header still shows something during a review-service blip).
  const reviewCount = reviewSummary?.count ?? provider.reviews.length;
  const ratingAvg =
    reviewSummary && reviewSummary.count > 0 ? reviewSummary.rating : avg;

  const away =
    !!provider.awayUntil && new Date(provider.awayUntil) > new Date();

  // Instrument-style readout mirroring the registry header on the listing.
  // Captions are localized (#380); the localized experience/review copy
  // still reads in the meta line below.
  const stats: Stat[] = [];
  if (provider.experience > 0)
    stats.push({ label: t.profile.stats.expYears, value: provider.experience });
  if (ratingAvg !== null)
    stats.push({ label: t.profile.stats.rating, value: ratingAvg.toFixed(1) });
  stats.push({ label: t.profile.stats.reviews, value: reviewCount });

  return (
    <div>
      {/* LocalBusiness structured data (#379): name, bilingual headline,
          address, category and — when reviews exist — the aggregate rating,
          matching the figures rendered in the hero. */}
      <JsonLd
        data={providerJsonLd(
          {
            id: provider.id,
            name: provider.user.name,
            category: provider.category,
            headline: provider.headline,
            headlineSi: provider.headlineSi,
            district: provider.district,
            city: provider.city,
            avatarUrl: provider.avatarUrl,
            rating: ratingAvg,
            reviewCount,
          },
          locale,
          urlLocale,
        )}
      />
      {/* -- Blueprint hero band ---------------------------------------- */}
      <section className="blueprint-grid border-b border-ink-300 bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-5">
              <div className="tech-corners shrink-0 border border-ink-300 bg-surface p-1.5">
                <Avatar
                  name={provider.user.name}
                  url={provider.avatarUrl}
                  size={84}
                />
              </div>
              <div>
                <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
                  <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
                    PRO
                  </span>
                  <span className="flex items-center gap-1.5 text-ink-500">
                    <CategoryIcon
                      slug={provider.category}
                      className="h-3.5 w-3.5"
                    />
                    {categoryLabelLoc(provider.category, locale)}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  <h1 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                    {provider.user.name}
                  </h1>
                  {provider.verificationStatus === "VERIFIED" && (
                    <VerifiedBadge label={t.card.verified} size="md" />
                  )}
                  {away ? (
                    <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {t.profile.awayUntil(
                        formatDate(provider.awayUntil!, locale)
                      )}
                    </span>
                  ) : provider.available ? (
                    <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {t.profile.available}
                    </span>
                  ) : (
                    <span className="chip bg-ink-100 text-ink-500">
                      {t.profile.unavailable}
                    </span>
                  )}
                </div>
                <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-500">
                  <FaLocationDot className="h-3.5 w-3.5" />
                  {provider.city} · {districtLabelLoc(provider.district, locale)}
                  {provider.experience > 0 &&
                    ` · ${t.profile.exp(provider.experience)}`}
                </p>
                {/* Multi-district service area (#502): the full served set,
                    shown when it goes beyond the home district. */}
                {(provider.serviceDistricts?.length ?? 0) > 1 && (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-ink-500">
                    {t.serviceDistricts.areasLabel}:{" "}
                    {provider
                      .serviceDistricts!.map((d) => districtLabelLoc(d, locale))
                      .join(", ")}
                  </p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  {ratingAvg !== null ? (
                    <>
                      <Stars rating={ratingAvg} size="md" />
                      <span className="font-semibold tabular-nums text-ink-800">
                        {ratingAvg.toFixed(1)}
                      </span>
                      <span className="text-sm text-ink-500">
                        {t.profile.reviewsShort(reviewCount)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-ink-500">
                      {t.card.noReviews}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canFavorite && (
                <FavoriteButton
                  providerId={provider.id}
                  initialFavorited={favorited}
                  variant="inline"
                />
              )}
              <ShareButton
                title={`${provider.user.name} — ${categoryLabelLoc(
                  provider.category,
                  locale
                )}`}
              />
              {!isOwner && (
                <ReportButton
                  endpoint={`/api/providers/${provider.id}/report`}
                  label={t.report.reportProvider}
                  variant="chip"
                  showLabel={false}
                />
              )}
            </div>
          </div>

          {/* Instrument readout + direct-contact rail */}
          <div className="mt-8 flex flex-col gap-6 border-t border-dashed border-ink-300 pt-6 sm:flex-row sm:items-start sm:justify-between">
            <StatReadout stats={stats} />
            <ContactLinks
              providerId={provider.id}
              hasPhone={provider.hasPhone}
              hasWhatsapp={provider.hasWhatsapp}
              hasPhone2={provider.hasPhone2}
              hasEmail={provider.hasEmail}
              facebook={provider.facebook}
              instagram={provider.instagram}
              tiktok={provider.tiktok}
              youtube={provider.youtube}
              website={provider.website}
              altLabel={t.profile.altPhone}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-3">
          <InView stagger className="space-y-8 lg:col-span-2">
            <SpecSection code="01" title={t.profile.about}>
              <p className="mt-3 font-medium text-ink-800">
                {bilingualText(provider.headline, provider.headlineSi, locale)}
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                {bilingualText(provider.bio, provider.bioSi, locale)}
              </p>
              {/* Map pin (#48): a static OSM mini-map, only when the provider
                  dropped a pin — never a substituted district centroid. */}
              {provider.latitude !== undefined &&
                provider.longitude !== undefined && (
                  <div className="mt-5">
                    <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
                      {t.location.profileLocation}
                    </h3>
                    <div className="mt-2">
                      <StaticLocationMap
                        latitude={provider.latitude}
                        longitude={provider.longitude}
                        alt={t.location.mapImageAlt(provider.user.name)}
                        linkLabel={t.location.viewOnOsm}
                      />
                    </div>
                  </div>
                )}
            </SpecSection>

            <SpecSection code="02" title={t.profile.services}>
              {provider.services.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">
                  {t.profile.noServices}
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-dashed divide-ink-300">
                  {provider.services.map((s, i) => (
                    <li
                      key={s.id}
                      className="flex items-start justify-between gap-4 py-3.5"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-400 tabular-nums">
                          S-{String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-ink-800">{s.title}</p>
                          {s.description && (
                            <p className="mt-0.5 text-sm text-ink-500">
                              {s.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-sm border border-brand-200 bg-brand-50 px-2.5 py-1 text-right font-mono text-xs font-semibold tabular-nums text-brand-800">
                        {formatLKR(s.price, locale)}
                        <span className="font-normal text-brand-700/70">
                          {" · "}
                          {priceTypeLabelLoc(s.priceType, locale)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SpecSection>

            <SpecSection code="03" title={t.profile.photos}>
              {provider.photos.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">
                  {t.profile.noPhotos}
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
            </SpecSection>

            <ReviewSection
              providerId={provider.id}
              providerName={provider.user.name}
              reviews={provider.reviews.map((r) => ({
                id: r.id,
                rating: r.rating,
                comment: r.comment,
                createdAt: r.createdAt,
                userName: r.user.name,
                photos: r.photos.map((ph) => ({ id: ph.id, url: ph.url })),
                response: r.response
                  ? { text: r.response.text, createdAt: r.response.createdAt }
                  : null,
              }))}
              canReview={!!session && !isOwner}
              canRespond={isOwner}
              signedIn={!!session}
              summary={reviewSummary}
              myReview={
                myReview
                  ? {
                      rating: myReview.rating,
                      comment: myReview.comment,
                      photos: myReview.photos.map((ph) => ({
                        id: ph.id,
                        url: ph.url,
                      })),
                    }
                  : null
              }
            />
          </InView>

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
