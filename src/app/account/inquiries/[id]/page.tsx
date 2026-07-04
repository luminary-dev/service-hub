import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import MessageThread from "@/components/MessageThread";

export const dynamic = "force-dynamic";

export default async function AccountInquiryThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const t = dict[locale];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/account"
        className="text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        ← {t.account.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
        {t.messages.title}
      </h1>
      <div className="mt-6">
        <MessageThread inquiryId={id} />
      </div>
    </div>
  );
}
