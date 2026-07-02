import { redirect } from "next/navigation";
import { FaArrowUpRightFromSquare, FaCircleCheck } from "react-icons/fa6";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import DashboardTabs from "@/components/dashboard/DashboardTabs";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "PROVIDER") redirect("/providers");

  const provider = await db.provider.findUnique({
    where: { userId: session.userId },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      services: { orderBy: { price: "asc" } },
      photos: { orderBy: { createdAt: "desc" } },
      reviews: { select: { rating: true } },
      inquiries: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!provider) redirect("/register/provider");

  const locale = await getLocale();
  const t = dict[locale];
  const { welcome } = await searchParams;
  const avg = provider.reviews.length
    ? provider.reviews.reduce((s, r) => s + r.rating, 0) /
      provider.reviews.length
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {welcome && (
        <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-brand-900">
            <FaCircleCheck className="h-4 w-4 text-brand-600" />
            {t.dashboard.welcomeTitle(provider.user.name.split(" ")[0])}
          </h2>
          <p className="mt-1 text-sm text-brand-800">
            {t.dashboard.welcomeBody}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink-900">
            {t.dashboard.title}
          </h1>
          <p className="mt-1 text-ink-500">{t.dashboard.subtitle}</p>
        </div>
        <a
          href={`/providers/${provider.id}`}
          className="btn-secondary"
          target="_blank"
        >
          {t.dashboard.viewPublic}
          <FaArrowUpRightFromSquare className="h-3 w-3" />
        </a>
      </div>

      <DashboardTabs
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
          avatarUrl: provider.avatarUrl,
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
            createdAt: i.createdAt.toISOString(),
          })),
          stats: {
            rating: avg,
            reviewCount: provider.reviews.length,
            photoCount: provider.photos.length,
            newInquiries: provider.inquiries.filter((i) => i.status === "NEW")
              .length,
          },
        }}
      />
    </div>
  );
}
