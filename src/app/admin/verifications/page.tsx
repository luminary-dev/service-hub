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
import VerificationQueue, {
  type PendingVerification,
} from "@/components/admin/VerificationQueue";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export default async function AdminVerificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

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
            <VerificationQueue items={pending} />
          </>
        )}
      </div>
    </div>
  );
}
