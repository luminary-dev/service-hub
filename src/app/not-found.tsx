import Link from "next/link";
import { FaCompass } from "react-icons/fa6";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";

export default async function NotFound() {
  const locale = await getLocale();
  const t = dict[locale];

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <FaCompass className="h-16 w-16 text-ink-300" />
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink-900">
        {t.errors.notFoundTitle}
      </h1>
      <p className="mt-2 text-ink-500">{t.errors.notFoundBody}</p>
      <div className="mt-8 flex gap-3">
        <Link href={localizedHref("/", locale)} className="btn-primary">
          {t.errors.goHome}
        </Link>
        <Link href={localizedHref("/providers", locale)} className="btn-secondary">
          {t.errors.browse}
        </Link>
      </div>
    </div>
  );
}
