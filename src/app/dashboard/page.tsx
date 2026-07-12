import { redirect } from "next/navigation";
import { FaArrowUpRightFromSquare, FaCircleCheck } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { fetchCategoryOptions } from "@/lib/categories-server";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import Link from "next/link";
import { FaBriefcase } from "@/components/icons";
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import EmailVerifyBanner from "@/components/EmailVerifyBanner";
import VerificationSection from "@/components/dashboard/VerificationSection";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout, { type Stat } from "@/components/ui/StatReadout";

// Caching (#57): session-gated and must reflect the user's own writes
// immediately — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Dashboard payload as served by `GET /api/provider/dashboard` on the
// gateway. Contact details live on identity-service and arrive hydrated
// under `user`; the review summary comes precomputed from review-service.
type DashboardProvider = {
  id: string;
  userId: string;
  category: string;
  headline: string;
  bio: string;
  district: string;
  city: string;
  experience: number;
  available: boolean;
  awayUntil: string | null;
  verificationStatus: string;
  avatarUrl: string | null;
  coverPhoto: string | null;
  whatsapp: string | null;
  phone2: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  website: string | null;
  user: {
    name: string;
    email: string;
    phone: string | null;
    emailVerified: string | null;
  };
  services: {
    id: string;
    title: string;
    description: string | null;
    price: number;
    priceType: string;
  }[];
  photos: { id: string; url: string; caption: string | null }[];
  inquiries: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    message: string;
    status: string;
    createdAt: string;
  }[];
  ratingSummary: { rating: number | null; count: number };
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "PROVIDER") redirect("/providers");

  const [dashboard, categories] = await Promise.all([
    apiJson<{
      provider: DashboardProvider;
      openJobsCount: number;
    }>("/api/provider/dashboard"),
    fetchCategoryOptions(),
  ]);
  const provider = dashboard?.provider ?? null;
  if (!provider) redirect("/register/provider");

  const matchingJobs = dashboard?.openJobsCount ?? 0;

  const locale = await getLocale();
  const t = dict[locale];
  const { welcome } = await searchParams;
  const avg = provider.ratingSummary.rating;

  // Overview instruments in the blueprint header band (mirrors the registry
  // stat readout on the providers listing): rating renders as a fixed string,
  // the counts zero-pad.
  const stats: Stat[] = [
    { label: t.dashboard.stats.rating, value: avg !== null ? avg.toFixed(1) : "—" },
    { label: t.dashboard.stats.reviews, value: provider.ratingSummary.count },
    { label: t.dashboard.stats.photos, value: provider.photos.length },
    { label: t.dashboard.stats.newInquiries, value: provider.inquiries.filter((i) => i.status === "NEW").length },
  ];

  return (
    <div>
      <PageHeader
        tag="DASH"
        eyebrow={t.nav.dashboard}
        title={t.dashboard.title}
        status={t.dashboard.subtitle}
      >
        <div className="flex w-full flex-col items-start gap-5 sm:w-auto sm:items-end">
          <a
            href={`/providers/${provider.id}`}
            className="btn-secondary"
            target="_blank"
          >
            {t.dashboard.viewPublic}
            <FaArrowUpRightFromSquare className="h-3 w-3" />
          </a>
          <StatReadout stats={stats} />
        </div>
      </PageHeader>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {!provider.user.emailVerified && <EmailVerifyBanner />}
        <VerificationSection status={provider.verificationStatus} />
        {matchingJobs > 0 && (
          <Link
            href="/jobs"
            className="tech-corners mb-6 flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4 transition-colors duration-200 ease-snap hover:border-brand-400"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-brand-900">
              <FaBriefcase className="h-4 w-4 text-brand-600" />
              {t.jobs.matchingBadge(matchingJobs)}
            </span>
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
              {t.jobs.boardTitle} →
            </span>
          </Link>
        )}
        {welcome && (
          <div className="tech-corners mb-6 rounded-lg border border-brand-200 bg-brand-50 p-5">
            <h2 className="flex items-center gap-2 font-semibold text-brand-900">
              <FaCircleCheck className="h-4 w-4 text-brand-600" />
              {t.dashboard.welcomeTitle(provider.user.name.split(" ")[0])}
            </h2>
            <p className="mt-1 text-sm text-brand-800">
              {t.dashboard.welcomeBody}
            </p>
          </div>
        )}

        <DashboardTabs
          categories={categories}
          data={{
            providerId: provider.id,
          name: provider.user.name,
          email: provider.user.email,
          phone: provider.user.phone ?? "",
          category: provider.category,
          headline: provider.headline,
          bio: provider.bio,
          district: provider.district,
          city: provider.city,
          experience: provider.experience,
          available: provider.available,
          awayUntil: provider.awayUntil,
          avatarUrl: provider.avatarUrl,
          coverPhoto: provider.coverPhoto,
          whatsapp: provider.whatsapp ?? "",
          phone2: provider.phone2 ?? "",
          facebook: provider.facebook ?? "",
          instagram: provider.instagram ?? "",
          tiktok: provider.tiktok ?? "",
          youtube: provider.youtube ?? "",
          website: provider.website ?? "",
          services: provider.services.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description ?? "",
            price: s.price,
            priceType: s.priceType,
          })),
          photos: provider.photos.map((p) => ({
            id: p.id,
            url: p.url,
            caption: p.caption ?? "",
          })),
          inquiries: provider.inquiries.map((i) => ({
            id: i.id,
            name: i.name,
            phone: i.phone,
            email: i.email ?? "",
            message: i.message,
            status: i.status,
            createdAt: i.createdAt,
          })),
          stats: {
            rating: avg,
            reviewCount: provider.ratingSummary.count,
            photoCount: provider.photos.length,
            newInquiries: provider.inquiries.filter((i) => i.status === "NEW")
              .length,
          },
        }}
        />
      </div>
    </div>
  );
}
