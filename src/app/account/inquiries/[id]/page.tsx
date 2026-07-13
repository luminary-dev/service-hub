import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { loginNext } from "@/lib/login";
import { dict } from "@/lib/i18n";
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
  const session = await getSession();
  if (!session) {
    const { id } = await params;
    redirect(await loginNext(`/account/inquiries/${encodeURIComponent(id)}`));
  }
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const t = dict[locale];

  return (
    <div>
      <PageHeader
        tag="MSG"
        eyebrow={
          <Link href="/account" className="hover:text-brand-700">
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
