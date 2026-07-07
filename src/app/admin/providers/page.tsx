import Link from "next/link";
import { redirect } from "next/navigation";
import { FaUsers } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import {
  normalizeAdminSort,
  normalizeStatusFilter,
  normalizeSuspendedFilter,
} from "@/lib/admin-list";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import EmptyState from "@/components/ui/EmptyState";
import AdminProvidersFilterBar from "@/components/admin/AdminProvidersFilterBar";
import type { AdminCategory } from "@/components/admin/AdminCategoryManager";
import AdminProvidersList, {
  type AdminProviderRow,
} from "@/components/admin/AdminProvidersList";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

  const params = await searchParams;
  const locale = await getLocale();
  const t = dict[locale].admin;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const city = typeof params.city === "string" ? params.city.trim() : "";
  const status = normalizeStatusFilter(params.status);
  const suspended = normalizeSuspendedFilter(params.suspended);
  const sort = normalizeAdminSort(params.sort);
  const page = Math.max(1, Number(params.page) || 1);

  // Search, filtering, ranking and pagination all happen in provider-service;
  // the query params pass straight through the gateway.
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  if (city) query.set("city", city);
  if (status) query.set("status", status);
  if (suspended) query.set("suspended", suspended);
  query.set("sort", sort);
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const [listing, categoriesData] = await Promise.all([
    apiJson<{
      providers: AdminProviderRow[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/admin/providers?${query.toString()}`),
    apiJson<{ categories: AdminCategory[] }>("/api/admin/categories"),
  ]);

  const providers = listing?.providers ?? [];
  const total = listing?.total ?? 0;
  const pageSize = listing?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const categories = categoriesData?.categories ?? [];
  const hasFilters = Boolean(q || category || city || status || suspended);

  function pageLink(target: number) {
    const sp = new URLSearchParams(query);
    sp.set("page", String(target));
    return `/admin/providers?${sp.toString()}`;
  }

  return (
    <div>
      <PageHeader
        tag="REG"
        eyebrow={t.providersLink}
        title={t.providersTitle}
        status={t.providersSubtitle}
      >
        <StatReadout stats={[{ label: "TOTAL", value: total }]} />
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <AdminProvidersFilterBar
          q={q}
          category={category}
          city={city}
          status={status}
          suspended={suspended}
          sort={sort}
          categories={categories}
        />

        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
          {t.adminFound(total)}
        </p>

        {providers.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={FaUsers}
              title={total === 0 && !hasFilters ? t.providersEmpty : t.adminNoResults}
            />
          </div>
        ) : (
          // Bulk actions (#231): multi-select + bulk suspend/unsuspend layered on
          // top of dev's per-row moderation (search/filter/sort/pagination live
          // on this server page; selection state lives in the client component).
          <div className="mt-4">
            <AdminProvidersList providers={providers} role={session.role} />
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link href={pageLink(page - 1)} className="btn-secondary">
                {dict[locale].browse.prev}
              </Link>
            )}
            <span className="px-3 text-sm text-ink-500">
              {dict[locale].browse.pageOf(page, totalPages)}
            </span>
            {page < totalPages && (
              <Link href={pageLink(page + 1)} className="btn-secondary">
                {dict[locale].browse.next}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
