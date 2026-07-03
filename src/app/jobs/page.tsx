import Link from "next/link";
import { redirect } from "next/navigation";
import { FaPhone, FaPlus } from "react-icons/fa6";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getCurrentProvider } from "@/lib/provider-auth";
import { getLocale } from "@/lib/locale";
import { dict, categoryLabelLoc, districtLabelLoc } from "@/lib/i18n";
import JobRespondForm from "@/components/jobs/JobRespondForm";
import JobStatusToggle from "@/components/jobs/JobStatusToggle";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function JobsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [locale, provider] = await Promise.all([
    getLocale(),
    getCurrentProvider(),
  ]);
  const t = dict[locale].jobs;

  const board = provider
    ? await db.jobRequest.findMany({
        where: {
          status: "OPEN",
          category: provider.category,
          district: provider.district,
          NOT: { customerId: session.userId },
        },
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { name: true } },
          responses: { where: { providerId: provider.id }, select: { id: true } },
        },
      })
    : [];

  const myJobs = await db.jobRequest.findMany({
    where: { customerId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      responses: {
        include: {
          provider: {
            include: { user: { select: { name: true, phone: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

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
                        {t.budgetTag(job.budget.toLocaleString("en-LK"))}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {job.customer.name} · {t.postedOn} {fmtDate(job.createdAt)}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                    {job.description}
                  </p>
                  {job.responses.length > 0 ? (
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
                              href={`/providers/${r.providerId}`}
                              className="text-sm font-medium text-ink-800 hover:text-brand-700"
                            >
                              {r.provider.user.name}
                            </Link>
                            {r.provider.user.phone && (
                              <a
                                href={`tel:${r.provider.user.phone}`}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
                              >
                                <FaPhone className="h-3 w-3" />
                                {r.provider.user.phone}
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
