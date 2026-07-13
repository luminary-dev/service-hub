import { redirect } from "next/navigation";
import Link from "next/link";
import { FaHouse, FaScrewdriverWrench } from "@/components/icons";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";

export const metadata = { title: "Welcome to Baas.lk" };

// Role chooser shown after a first social signup (#398). New OAuth users land
// here as CUSTOMER; they either continue as a customer or set up a provider
// profile. Anyone who already has a role (returning provider/admin) skips it.
export default async function WelcomePage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect(localizedHref("/login", locale));

  if (session.role === "PROVIDER") redirect(localizedHref("/dashboard", locale));
  if (session.role !== "CUSTOMER") redirect(localizedHref("/", locale));

  const t = dict[locale].welcome;

  return (
    <div className="blueprint-grid">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="flex items-center justify-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            {t.badge}
          </span>
          <span className="text-ink-500">{t.tag}</span>
        </div>
        <h1 className="mt-3 text-center text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          {t.title}
        </h1>
        <p className="mt-2 text-center text-ink-600">{t.sub}</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <Link
            href={localizedHref("/providers", locale)}
            className="tech-corners card group relative p-8 transition-[border-color,transform] duration-200 ease-snap hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              REG-C / CUSTOMER
            </span>
            <span className="mt-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <FaHouse className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-ink-900 transition-colors duration-200 group-hover:text-brand-700">
              {t.customerTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              {t.customerBody}
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-brand-700">
              {t.customerCta}
            </span>
          </Link>

          <Link
            href={localizedHref("/welcome/provider", locale)}
            className="group relative overflow-hidden rounded-lg bg-brand-700 p-8 transition-[background-color,transform] duration-200 ease-snap hover:bg-brand-800 dark:bg-brand-50 dark:hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 dark:text-brand-900/70">
              REG-P / PRO
            </span>
            <span className="mt-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white dark:bg-brand-900/10 dark:text-brand-900">
              <FaScrewdriverWrench className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-white dark:text-brand-900">
              {t.providerTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-100 dark:text-brand-900/80">
              {t.providerBody}
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-white dark:text-brand-900">
              {t.providerCta}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
