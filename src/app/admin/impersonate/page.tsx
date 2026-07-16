import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import ImpersonateForm from "@/components/admin/ImpersonateForm";

// Caching (#57): admin-only, session-gated — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.adminImpersonate };
}

// Standalone "view as" entry point (#234). This is a stopgap: once #220
// (admin user management, "View as" trigger point) merges, this should
// become a button on the user detail page instead of its own route.
export default async function AdminImpersonatePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const t = dict[await getLocale()].admin;

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.impersonateTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.impersonateSubtitle}</p>

      <ImpersonateForm />
    </div>
  );
}
