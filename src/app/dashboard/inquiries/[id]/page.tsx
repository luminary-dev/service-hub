import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";
import MessageThread from "@/components/MessageThread";

// Caching (#57): session-gated and must reflect the user's own writes
// immediately — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export default async function DashboardInquiryThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect(localizedHref("/login", locale));
  const { id } = await params;
  const t = dict[locale];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href={localizedHref("/dashboard", locale)}
        className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-brand-700 hover:text-brand-800"
      >
        ← {t.nav.dashboard}
      </Link>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white dark:text-ink-50">
          MSG
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {t.messages.title}
        </h1>
      </div>
      <div className="mt-6">
        <MessageThread inquiryId={id} />
      </div>
    </div>
  );
}
