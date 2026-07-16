import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import AdminCategoryManager, {
  type AdminCategory,
} from "@/components/admin/AdminCategoryManager";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.adminCategories };
}

// Category management as served by `GET /api/admin/categories` on the gateway
// (every category, inactive included, in display order).
export default async function AdminCategoriesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/");

  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{ categories: AdminCategory[] }>("/api/admin/categories"),
  ]);
  const categories = data?.categories ?? [];
  const t = dict[locale].admin;

  const activeCount = categories.filter((c) => c.active).length;

  return (
    <div>
      <PageHeader
        tag="CAT"
        eyebrow={t.indexTitle}
        title={t.categoriesTitle}
        status={t.categoriesSubtitle}
      >
        <StatReadout
          stats={[
            { label: t.stats.total, value: categories.length },
            { label: t.stats.active, value: activeCount },
            { label: t.stats.inactive, value: categories.length - activeCount },
          ]}
        />
      </PageHeader>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <AdminCategoryManager initial={categories} role={session.role} />
      </div>
    </div>
  );
}
