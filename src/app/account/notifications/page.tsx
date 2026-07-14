import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { loginNext } from "@/lib/login";
import { dict } from "@/lib/i18n";
import type { NotificationDTO } from "@/lib/notifications";
import PageHeader from "@/components/ui/PageHeader";
import NotificationsFeed from "@/components/NotificationsFeed";

// Session-gated and must reflect mark-read writes immediately — fully
// dynamic, like the rest of the account area (#57).
export const dynamic = "force-dynamic";

// The full notification feed (#394): the server fetches the first page; the
// client component renders sentences from type + payload (so locale
// switches re-render the feed) and pages older rows via the API's cursor.
export default async function NotificationsPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect(await loginNext("/account/notifications"));

  const t = dict[locale];
  const data = await apiJson<{
    notifications: NotificationDTO[];
    nextCursor: string | null;
  }>("/api/notifications?take=20");

  return (
    <div>
      <PageHeader
        tag="NTF"
        eyebrow={t.notifications.title}
        title={t.notifications.title}
        status={t.notifications.subtitle}
      />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <NotificationsFeed
          initial={data?.notifications ?? []}
          initialCursor={data?.nextCursor ?? null}
        />
      </div>
    </div>
  );
}
