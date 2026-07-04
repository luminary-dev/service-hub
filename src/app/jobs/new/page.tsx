import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchCategoryOptions } from "@/lib/categories-server";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import JobPostForm from "@/components/jobs/JobPostForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const t = dict[await getLocale()].jobs;
  const categories = await fetchCategoryOptions();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.postTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.postSubtitle}</p>
      <div className="mt-8">
        <JobPostForm categories={categories} />
      </div>
    </div>
  );
}
