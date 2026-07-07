import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FaArrowRight, FaBriefcase } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import { formatDate, formatLKR } from "@/lib/format";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Detail payload as served by `GET /api/admin/jobs/:id` on the gateway:
// job info plus its responses, with customer and provider contact info
// hydrated (degrades to "Unknown" / null through an upstream outage).
type AdminJobDetail = {
  id: string;
  title: string;
  description: string;
  category: string;
  district: string;
  budget: number | null;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  customer: { id: string; name: string; email: string | null };
  responses: {
    id: string;
    message: string;
    createdAt: string;
    provider: { id: string; name: string; phone: string | null };
  }[];
};

export default async function AdminJobDetailPage({
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
    apiJson<{ job: AdminJobDetail }>(`/api/admin/jobs/${encodeURIComponent(id)}`),
  ]);
  const job = data?.job ?? null;
  if (!job) notFound();
  const t = dict[locale].admin;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/jobs"
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← {t.jobBack}
      </Link>

      <div className="card mt-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <FaBriefcase className="h-5 w-5 text-brand-600" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            {job.title}
          </h1>
          {job.status === "OPEN" ? (
            <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">
              {t.jobStatusOpen}
            </span>
          ) : (
            <span className="chip bg-ink-100 text-ink-500">
              {t.jobStatusClosed}
            </span>
          )}
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-500">{t.jobDetailCategory}</dt>
            <dd className="font-medium text-ink-900">
              {categoryLabelLoc(job.category, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">{t.jobDetailDistrict}</dt>
            <dd className="font-medium text-ink-900">
              {districtLabelLoc(job.district, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">{t.jobBudget}</dt>
            <dd className="font-medium text-ink-900">
              {job.budget != null ? formatLKR(job.budget, locale) : t.jobNoBudget}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">{t.jobDetailPosted}</dt>
            <dd className="font-medium text-ink-900">
              {formatDate(job.createdAt, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">{t.jobCustomer}</dt>
            <dd className="font-medium text-ink-900">
              {job.customer.name}
              {job.customer.email ? ` · ${job.customer.email}` : ""}
            </dd>
          </div>
        </dl>

        <div className="mt-5 border-t border-ink-100 pt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t.jobDescription}
          </p>
          <p className="whitespace-pre-line text-sm text-ink-700">
            {job.description}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-ink-900">
          {t.jobResponsesHeading} ({job.responses.length})
        </h2>

        {job.responses.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">{t.jobNoResponses}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {job.responses.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">
                    {t.jobResponseFrom} {r.provider.name}
                    {r.provider.phone ? ` · ${r.provider.phone}` : ""}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-500">
                      {formatDate(r.createdAt, locale)}
                    </span>
                    <Link
                      href={`/providers/${r.provider.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                    >
                      {t.viewProvider}
                      <FaArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-ink-600">
                  {r.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
