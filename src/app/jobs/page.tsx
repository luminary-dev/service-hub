import Link from "next/link";
import { redirect } from "next/navigation";
import { FaBriefcase, FaInbox, FaPhone, FaPlus } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { dict, categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import InView from "@/components/InView";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import EmptyState from "@/components/ui/EmptyState";
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

// Both listings are paginated by the job-service (#203): a bounded page plus
// the full-set `total` so we can render page controls without loading
// everything. `page`/`pageSize` echo the normalized request.
type Page<T> = { jobs: T[]; total: number; page: number; pageSize: number };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const boardPage = Math.max(1, Number(params.boardPage) || 1);
  const minePage = Math.max(1, Number(params.minePage) || 1);

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
  const nav = dict[locale].nav;
  const provider = dashboard?.provider ?? null;

  const [boardData, mineData] = await Promise.all([
    provider
      ? apiJson<Page<BoardJob>>(`/api/jobs/board?page=${boardPage}`)
      : Promise.resolve(null),
    apiJson<Page<MyJob>>(`/api/jobs/mine?page=${minePage}`),
  ]);
  const board = boardData?.jobs ?? [];
  const myJobs = mineData?.jobs ?? [];
  const openCount = myJobs.filter((j) => j.status === "OPEN").length;

  // Total-set counts for the header readout; the lists themselves show one
  // page. RESPONDED/OPEN stay best-effort over the visible page (the service
  // exposes no total for those derived counts).
  const boardTotal = boardData?.total ?? board.length;
  const mineTotal = mineData?.total ?? myJobs.length;
  const boardPageSize = boardData?.pageSize ?? board.length;
  const minePageSize = mineData?.pageSize ?? myJobs.length;
  const boardTotalPages = Math.max(1, Math.ceil(boardTotal / (boardPageSize || 1)));
  const mineTotalPages = Math.max(1, Math.ceil(mineTotal / (minePageSize || 1)));

  // Build an href that changes one section's page while preserving the other.
  function pageHref(key: "boardPage" | "minePage", value: number) {
    const sp = new URLSearchParams();
    if (boardPage > 1) sp.set("boardPage", String(boardPage));
    if (minePage > 1) sp.set("minePage", String(minePage));
    sp.set(key, String(value));
    return `/jobs?${sp.toString()}`;
  }

  function pager(key: "boardPage" | "minePage", current: number, totalPages: number) {
    if (totalPages <= 1) return null;
    return (
      <div className="mt-8 flex items-center justify-center gap-2">
        {current > 1 && (
          <Link href={pageHref(key, current - 1)} className="btn-secondary">
            {t.prev}
          </Link>
        )}
        <span className="px-3 text-sm text-ink-500">
          {t.pageOf(current, totalPages)}
        </span>
        {current < totalPages && (
          <Link href={pageHref(key, current + 1)} className="btn-secondary">
            {t.next}
          </Link>
        )}
      </div>
    );
  }

  // Instrument readout in the header band — board-focused for providers,
  // posting-focused for customers. Labels are decorative mono captions
  // (matching the registry header), values are localized counts.
  const stats = provider
    ? [
        { label: "MATCHING", value: boardTotal },
        { label: "RESPONDED", value: board.filter((j) => j.responded).length },
      ]
    : [
        { label: "POSTED", value: mineTotal },
        { label: "OPEN", value: openCount },
      ];

  return (
    <div>
      {/* Jobs header band */}
      <PageHeader
        tag="JOB"
        eyebrow={nav.jobs}
        title={provider ? t.boardTitle : t.myTitle}
        status={
          provider
            ? t.boardSubtitle(
                categoryLabelLoc(provider.category, locale),
                districtLabelLoc(provider.district, locale)
              )
            : t.mySubtitle
        }
      >
        <div className="flex flex-col items-start gap-4 sm:items-end">
          <StatReadout stats={stats} />
          <Link href="/jobs/new" className="btn-primary">
            <FaPlus className="h-3.5 w-3.5" />
            {t.postCta}
          </Link>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Provider board: matching open jobs */}
        {provider && (
          <section>
            {board.length === 0 ? (
              <EmptyState icon={FaInbox} title={t.boardEmpty} />
            ) : (
              <InView as="ul" stagger className="space-y-4">
                {board.map((job) => (
                  <li
                    key={job.id}
                    className="card p-5 transition-[border-color] duration-200 ease-snap hover:border-brand-400"
                  >
                    <p className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
                      {categoryLabelLoc(job.category, locale)} ·{" "}
                      {districtLabelLoc(job.district, locale)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-display font-semibold text-ink-900">
                        {job.title}
                      </h2>
                      {job.budget != null && (
                        <span className="chip bg-brand-50 text-brand-700">
                          {t.budgetTag(formatNumber(job.budget, locale))}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {job.customer.name} · {t.postedOn}{" "}
                      {formatDate(job.createdAt, locale)}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                      {job.description}
                    </p>
                    <div className="mt-3.5 border-t border-dashed border-ink-300 pt-3.5">
                      {job.responded ? (
                        <span className="chip bg-emerald-50 text-emerald-700">
                          {t.respondedTag}
                        </span>
                      ) : (
                        <JobRespondForm jobId={job.id} />
                      )}
                    </div>
                  </li>
                ))}
              </InView>
            )}
            {pager("boardPage", boardPage, boardTotalPages)}
          </section>
        )}

        {/* Customer's own posted jobs */}
        {(!provider || myJobs.length > 0) && (
          <section className={provider ? "mt-12" : ""}>
            {provider && (
              <div className="mb-6">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">
                  {nav.jobs}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-ink-900">
                  {t.myTitle}
                </h2>
              </div>
            )}

            {myJobs.length === 0 ? (
              <EmptyState
                icon={FaBriefcase}
                title={t.myEmpty}
                action={
                  <Link href="/jobs/new" className="btn-primary">
                    {t.postCta}
                  </Link>
                }
              />
            ) : (
              <InView as="ul" stagger className="space-y-4">
                {myJobs.map((job) => (
                  <li key={job.id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
                          {categoryLabelLoc(job.category, locale)} ·{" "}
                          {districtLabelLoc(job.district, locale)}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <h3 className="font-display font-semibold text-ink-900">
                            {job.title}
                          </h3>
                          <span
                            className={`chip ${
                              job.status === "OPEN"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-ink-100 text-ink-500"
                            }`}
                          >
                            {job.status === "OPEN"
                              ? t.statusOpen
                              : t.statusClosed}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {t.responsesCount(job.responses.length)}
                        </p>
                      </div>
                      <JobStatusToggle jobId={job.id} status={job.status} />
                    </div>

                    {job.responses.length === 0 ? (
                      <p className="mt-3.5 border-t border-dashed border-ink-300 pt-3.5 text-sm text-ink-500">
                        {t.noResponses}
                      </p>
                    ) : (
                      <ul className="mt-3.5 divide-y divide-dashed divide-ink-200 border-t border-dashed border-ink-300">
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
              </InView>
            )}
            {pager("minePage", minePage, mineTotalPages)}
          </section>
        )}
      </div>
    </div>
  );
}
