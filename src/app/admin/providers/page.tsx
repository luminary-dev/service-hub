import Link from "next/link";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import { qualityChipClasses } from "@/lib/quality";
import Avatar from "@/components/Avatar";
import AdminProviderActions from "@/components/admin/AdminProviderActions";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Admin listing as served by `GET /api/admin/providers` on the gateway
// (newest first, with contact details and review/photo counts hydrated).
type AdminProviderRow = {
  id: string;
  category: string;
  city: string;
  avatarUrl: string | null;
  verificationStatus: string;
  suspended: boolean;
  user: { name: string; email: string };
  _count: { reviews: number; photos: number };
  quality: {
    qualityScore: number;
    rating: number;
    reviewCount: number;
    openReportCount: number;
  };
};

export default async function AdminProvidersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{ providers: AdminProviderRow[] }>("/api/admin/providers"),
  ]);
  const providers = data?.providers ?? [];
  const t = dict[locale].admin;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.providersTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.providersSubtitle}</p>

      {providers.length === 0 ? (
        <div className="card mt-8 px-6 py-16 text-center text-sm text-ink-500">
          {t.providersEmpty}
        </div>
      ) : (
      <ul className="mt-8 space-y-3">
        {providers.map((p) => (
          <li
            key={p.id}
            className="card flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="flex items-center gap-3">
              <Avatar name={p.user.name} url={p.avatarUrl} size={40} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/providers/${p.id}`}
                    className="font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {p.user.name}
                  </Link>
                  {p.verificationStatus === "VERIFIED" && (
                    <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                      {t.verifiedTag}
                    </span>
                  )}
                  {p.verificationStatus === "PENDING" && (
                    <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                      {t.pendingTag}
                    </span>
                  )}
                  {p.suspended && (
                    <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                      {t.suspendedTag}
                    </span>
                  )}
                  <span
                    className={`chip ${qualityChipClasses(p.quality.qualityScore)}`}
                    title={t.qualityScoreBreakdown(
                      p.quality.rating,
                      p.quality.reviewCount,
                      p.quality.openReportCount
                    )}
                  >
                    {t.qualityScoreLabel} {p.quality.qualityScore}
                  </span>
                </div>
                <p className="text-sm text-ink-500">
                  {categoryLabelLoc(p.category, locale)} · {p.city} ·{" "}
                  {p._count.reviews} {t.reviewsHeading.toLowerCase()},{" "}
                  {p._count.photos} {t.photosHeading.toLowerCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/admin/providers/${p.id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                {t.moderate}
              </Link>
              <AdminProviderActions
                providerId={p.id}
                verified={p.verificationStatus === "VERIFIED"}
                suspended={p.suspended}
                role={session.role}
              />
            </div>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
