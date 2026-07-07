import { redirect } from "next/navigation";
import { FaFileLines, FaShieldHalved } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { formatDate } from "@/lib/format";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import Avatar from "@/components/Avatar";
import InView from "@/components/InView";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import EmptyState from "@/components/ui/EmptyState";
import VerificationActions from "@/components/admin/VerificationActions";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Pending queue as served by `GET /api/admin/verifications` on the gateway
// (oldest submission first, with docs and contact details).
type PendingVerification = {
  id: string;
  category: string;
  city: string;
  avatarUrl: string | null;
  updatedAt: string;
  user: { name: string; email: string };
  verificationDocs: { id: string; kind: string; url: string }[];
};

export default async function AdminVerificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{ providers: PendingVerification[] }>("/api/admin/verifications"),
  ]);
  const pending = data?.providers ?? [];
  const t = dict[locale];

  const docCount = pending.reduce((n, p) => n + p.verificationDocs.length, 0);

  return (
    <div>
      <PageHeader
        tag="VER"
        eyebrow={t.admin.indexTitle}
        title={t.admin.title}
        status={t.admin.subtitle}
      >
        <StatReadout
          stats={[
            { label: "PENDING", value: pending.length },
            { label: "DOCS", value: docCount },
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
            <InView as="ul" stagger className="space-y-4">
              {pending.map((p) => (
                <li key={p.id} className="tech-corners card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={p.user.name} url={p.avatarUrl} size={44} />
                      <div>
                        <p className="font-semibold text-ink-900">
                          {p.user.name}
                        </p>
                        <p className="text-sm text-ink-500">
                          {categoryLabelLoc(p.category, locale)} · {p.city} ·{" "}
                          {p.user.email}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.08em] text-ink-500">
                          <span className="text-ink-400">
                            {t.admin.submitted}
                          </span>
                          <span className="tabular-nums text-ink-600">
                            {formatDate(p.updatedAt, locale)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <VerificationActions providerId={p.id} />
                  </div>

                  <div className="mt-4 border-t border-dashed border-ink-200 pt-4">
                    <p className="eyebrow mb-2 !text-ink-500">
                      {t.admin.documents}
                    </p>
                    {p.verificationDocs.length === 0 ? (
                      <p className="text-sm text-ink-400">—</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {p.verificationDocs.map((d) => (
                          <a
                            key={d.id}
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-sm font-medium text-ink-700 transition-[border-color,color] duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
                          >
                            <FaFileLines className="h-3.5 w-3.5" />
                            {d.kind}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </InView>
          </>
        )}
      </div>
    </div>
  );
}
