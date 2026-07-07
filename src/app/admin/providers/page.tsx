import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import AdminProvidersList, {
  type AdminProviderRow,
} from "@/components/admin/AdminProvidersList";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{ providers: AdminProviderRow[] }>("/api/admin/providers"),
  ]);
  const providers = data?.providers ?? [];
  const t = dict[locale].admin;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.providersTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.providersSubtitle}</p>

      <AdminProvidersList providers={providers} />
    </div>
  );
}
