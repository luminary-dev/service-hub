import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";
import MessageThread from "@/components/MessageThread";
import PageHeader from "@/components/ui/PageHeader";

// Caching (#57): session-gated and must reflect the user's own writes
// immediately — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export default async function AccountInquiryThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect(localizedHref("/login", locale));
  const { id } = await params;
  const t = dict[locale];

  return (
    <div>
      <PageHeader
        tag="MSG"
        eyebrow={
          <Link
            href={localizedHref("/account", locale)}
            className="hover:text-brand-700"
          >
            ← {t.account.title}
          </Link>
        }
        title={t.messages.title}
      />
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <MessageThread inquiryId={id} />
      </div>
    </div>
  );
}
