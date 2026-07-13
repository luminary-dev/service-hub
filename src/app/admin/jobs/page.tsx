import Link from "next/link";
import { redirect } from "next/navigation";
import { FaBriefcase } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { fetchCategoryOptions } from "@/lib/categories-server";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import AdminJobFilters from "@/components/admin/AdminJobFilters";

// Caching (#57): admin-only moderation view; edits (new job posts/responses)
// must be visible on the next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Admin listing as served by `GET /api/admin/jobs` on the gateway (newest
// first, with the customer name and a response count hydrated).
type AdminJobRow = {
  id: string;
  title: string;
  category: string;
  district: string;
  budget: number | null;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  customer: { name: string };
  responseCount: number;
};

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const category = typeof params.category === "string" ? params.category : "";
  const page = Math.max(1, Number(params.page) || 1);

  // Pagination (#372) happens in job-service; page/pageSize pass straight
  // through the gateway and `total` drives the pager controls.
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (category) query.set("category", category);
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const [locale, data, categories] = await Promise.all([
    getLocale(),
    apiJson<{ jobs: AdminJobRow[]; total: number; page: number; pageSize: number }>(
      `/api/admin/jobs?${query.toString()}`
    ),
    fetchCategoryOptions(),
  ]);
  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const t = dict[locale].admin;
  const tb = dict[locale].browse;

  function pageLink(target: number) {
    const sp = new URLSearchParams(query);
    sp.set("page", String(target));
    return `/admin/jobs?${sp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-ink-900">
        <FaBriefcase className="h-6 w-6 text-brand-600" />
        {t.jobsTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.jobsSubtitle}</p>

      <div className="mt-6">
        <AdminJobFilters status={status} category={category} categories={categories} />
      </div>

      {jobs.length === 0 ? (
        <div className="card mt-8 px-6 py-16 text-center text-sm text-ink-500">
          {t.jobsEmpty}
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="card flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/jobs/${j.id}`}
                    className="font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {j.title}
                  </Link>
                  {j.status === "OPEN" ? (
                    <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                      {t.jobStatusOpen}
                    </span>
                  ) : (
                    <span className="chip bg-ink-100 text-ink-500">
                      {t.jobStatusClosed}
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-500">
                  {categoryLabelLoc(j.category, locale)} ·{" "}
                  {districtLabelLoc(j.district, locale)} · {t.jobPostedBy}{" "}
                  {j.customer.name} · {formatDate(j.createdAt, locale)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-500">
                  {t.jobResponses(j.responseCount)}
                </span>
                <Link
                  href={`/admin/jobs/${j.id}`}
                  className="text-sm font-medium text-brand-700 hover:text-brand-800"
                >
                  {t.jobView}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={pageLink(page - 1)} className="btn-secondary">
              {tb.prev}
            </Link>
          )}
          <span className="px-3 text-sm text-ink-500">
            {tb.pageOf(page, totalPages)}
          </span>
          {page < totalPages && (
            <Link href={pageLink(page + 1)} className="btn-secondary">
              {tb.next}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
