import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import AdminCategoryManager, {
  type AdminCategory,
} from "@/components/admin/AdminCategoryManager";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

// Category management as served by `GET /api/admin/categories` on the gateway
// (every category, inactive included, in display order).
export default async function AdminCategoriesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{ categories: AdminCategory[] }>("/api/admin/categories"),
  ]);
  const categories = data?.categories ?? [];
  const t = dict[locale].admin;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.categoriesTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.categoriesSubtitle}</p>

      <AdminCategoryManager initial={categories} />
    </div>
  );
}
