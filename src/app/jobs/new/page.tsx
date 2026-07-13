import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchCategoryOptions } from "@/lib/categories-server";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";
import PageHeader from "@/components/ui/PageHeader";
import JobPostForm from "@/components/jobs/JobPostForm";

// Caching (#57): session-gated and must reflect the user's own writes
// immediately — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect(localizedHref("/login", locale));
  const t = dict[locale].jobs;
  const nav = dict[locale].nav;
  const categories = await fetchCategoryOptions();

  return (
    <div>
      {/* Post-a-job header band */}
      <PageHeader
        tag="JOB"
        eyebrow={nav.jobs}
        title={t.postTitle}
        status={t.postSubtitle}
      />

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <JobPostForm categories={categories} />
      </div>
    </div>
  );
}
