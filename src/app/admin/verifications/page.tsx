import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FaShieldHalved } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import VerificationQueue, {
  type PendingVerification,
} from "@/components/admin/VerificationQueue";
import MarkQueueViewed from "@/components/admin/MarkQueueViewed";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.adminVerifications };
}

const PAGE_SIZE = 20;

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  // Pagination (#255) happens in provider-service; page/pageSize pass straight
  // through the gateway and `total` drives the controls + queue badge.
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });

  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{
      providers: PendingVerification[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/admin/verifications?${query.toString()}`),
  ]);
  const pending = data?.providers ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const t = dict[locale];

  const docCount = pending.reduce((n, p) => n + p.verificationDocs.length, 0);

  function pageLink(target: number) {
    const sp = new URLSearchParams(query);
    sp.set("page", String(target));
    return `/admin/verifications?${sp.toString()}`;
  }

  return (
    <div>
      {/* Badge baseline (#233) tracks the full pending total, not the page. */}
      <MarkQueueViewed queue="verifications" count={total} />
      <PageHeader
        tag="VER"
        eyebrow={t.admin.indexTitle}
        title={t.admin.title}
        status={t.admin.subtitle}
      >
        <StatReadout
          stats={[
            { label: t.admin.stats.pending, value: total },
            { label: t.admin.stats.docs, value: docCount },
          ]}
        />
      </PageHeader>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {pending.length === 0 ? (
          <EmptyState icon={FaShieldHalved} title={t.admin.empty} />
        ) : (
          <>
            {/* Active caution rail: this queue is awaiting review. */}
            <div className="hazard mb-6 h-1.5 w-full rounded-full" />
            <VerificationQueue items={pending} role={session.role} />
          </>
        )}

        <Pagination page={page} totalPages={totalPages} hrefFor={pageLink} locale={locale} />
      </div>
    </div>
  );
}
