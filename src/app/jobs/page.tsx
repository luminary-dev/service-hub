import Link from "next/link";
import { redirect } from "next/navigation";
import { FaPhone, FaPlus } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { dict, categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import JobRespondForm from "@/components/jobs/JobRespondForm";
import JobStatusToggle from "@/components/jobs/JobStatusToggle";

// Caching (#57): session-gated and must reflect the user's own writes
// immediately — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Job payloads as served by the gateway. Board jobs come with the customer
// name and a precomputed `responded` flag; own jobs carry hydrated responses.
type BoardJob = {
  id: string;
  title: string;
  description: string;
  category: string;
  district: string;
  budget: number | null;
  status: string;
  createdAt: string;
  customer: { name: string };
  responded: boolean;
};

type MyJob = {
  id: string;
  title: string;
  description: string;
  category: string;
  district: string;
  budget: number | null;
  status: string;
  createdAt: string;
  responses: {
    id: string;
    message: string;
    createdAt: string;
    provider: { id: string; name: string; phone: string | null };
  }[];
};

export default async function JobsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // The board subtitle needs the caller's provider category/district, which
  // the dashboard endpoint carries (it also confirms a provider profile
  // exists — role alone isn't enough, matching the old getCurrentProvider()).
  const [locale, dashboard] = await Promise.all([
    getLocale(),
    session.role === "PROVIDER"
      ? apiJson<{ provider: { category: string; district: string } }>(
          "/api/provider/dashboard"
        )
      : Promise.resolve(null),
  ]);
  const t = dict[locale].jobs;
  const provider = dashboard?.provider ?? null;

  const [boardData, mineData] = await Promise.all([
    provider
      ? apiJson<{ jobs: BoardJob[] }>("/api/jobs/board")
      : Promise.resolve(null),
    apiJson<{ jobs: MyJob[] }>("/api/jobs/mine"),
  ]);
  const board = boardData?.jobs ?? [];
  const myJobs = mineData?.jobs ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          {provider ? t.boardTitle : t.myTitle}
        </h1>
        <Link href="/jobs/new" className="btn-primary">
          <FaPlus className="h-3.5 w-3.5" />
          {t.postCta}
        </Link>
      </div>

      {/* Provider board: matching open jobs */}
      {provider && (
        <section className="mt-2">
          <p className="text-ink-600">
            {t.boardSubtitle(
              categoryLabelLoc(provider.category, locale),
              districtLabelLoc(provider.district, locale)
            )}
          </p>
          {board.length === 0 ? (
            <div className="card mt-6 px-6 py-16 text-center text-sm text-ink-500">
              {t.boardEmpty}
            </div>
          ) : (
            <ul className="mt-6 space-y-4">
              {board.map((job) => (
                <li key={job.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="font-semibold text-ink-900">{job.title}</h2>
                    {job.budget != null && (
                      <span className="chip bg-brand-50 text-brand-700">
                        {t.budgetTag(formatNumber(job.budget, locale))}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {job.customer.name} · {t.postedOn} {formatDate(job.createdAt, locale)}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                    {job.description}
                  </p>
                  {job.responded ? (
                    <span className="chip mt-3 bg-emerald-50 text-emerald-700">
                      {t.respondedTag}
                    </span>
                  ) : (
                    <JobRespondForm jobId={job.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Customer's own posted jobs */}
      {(!provider || myJobs.length > 0) && (
        <section className="mt-10">
          {provider && (
            <h2 className="text-xl font-semibold text-ink-900">{t.myTitle}</h2>
          )}
          {!provider && <p className="mt-1 text-ink-600">{t.mySubtitle}</p>}

          {myJobs.length === 0 ? (
            <div className="card mt-6 flex flex-col items-center px-6 py-16 text-center">
              <p className="text-sm text-ink-500">{t.myEmpty}</p>
              <Link href="/jobs/new" className="btn-primary mt-4">
                {t.postCta}
              </Link>
            </div>
          ) : (
            <ul className="mt-6 space-y-4">
              {myJobs.map((job) => (
                <li key={job.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-ink-900">
                          {job.title}
                        </h3>
                        <span
                          className={`chip ${
                            job.status === "OPEN"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-ink-100 text-ink-500"
                          }`}
                        >
                          {job.status === "OPEN" ? t.statusOpen : t.statusClosed}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {categoryLabelLoc(job.category, locale)} ·{" "}
                        {districtLabelLoc(job.district, locale)} ·{" "}
                        {t.responsesCount(job.responses.length)}
                      </p>
                    </div>
                    <JobStatusToggle jobId={job.id} status={job.status} />
                  </div>

                  {job.responses.length === 0 ? (
                    <p className="mt-3 text-sm text-ink-500">{t.noResponses}</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-ink-100">
                      {job.responses.map((r) => (
                        <li key={r.id} className="py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Link
                              href={`/providers/${r.provider.id}`}
                              className="text-sm font-medium text-ink-800 hover:text-brand-700"
                            >
                              {r.provider.name}
                            </Link>
                            {r.provider.phone && (
                              <a
                                href={`tel:${r.provider.phone}`}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
                              >
                                <FaPhone className="h-3 w-3" />
                                {r.provider.phone}
                              </a>
                            )}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-ink-600">
                            {r.message}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
