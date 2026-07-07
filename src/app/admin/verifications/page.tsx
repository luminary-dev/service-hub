import { redirect } from "next/navigation";
import { FaShieldHalved } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { formatDate } from "@/lib/format";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import Avatar from "@/components/Avatar";
import VerificationActions from "@/components/admin/VerificationActions";
import MarkQueueViewed from "@/components/admin/MarkQueueViewed";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <MarkQueueViewed queue="verifications" count={pending.length} />
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-ink-900">
        <FaShieldHalved className="h-6 w-6 text-brand-600" />
        {t.admin.title}
      </h1>
      <p className="mt-1 text-ink-600">{t.admin.subtitle}</p>

      {pending.length === 0 ? (
        <div className="card mt-8 px-6 py-16 text-center text-sm text-ink-500">
          {t.admin.empty}
        </div>
      ) : (
        <VerificationQueue items={pending} />
      )}
    </div>
  );
}
