import Link from "next/link";
import { FaHouse, FaScrewdriverWrench } from "@/components/icons";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import FacebookSignInButton from "@/components/FacebookSignInButton";
import { ConsentNotice } from "@/components/LegalConsent";
import { dict } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { localizedHref } from "@/lib/links";

export const metadata = { title: "Join Baas.lk" };

export default async function RegisterChoicePage() {
  const locale = await getLocale();
  const t = dict[locale];

  return (
    <div className="blueprint-grid">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="flex items-center justify-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            JOIN
          </span>
          <span className="text-ink-500">REGISTER</span>
        </div>
        <h1 className="mt-3 text-center text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          {t.choose.title}
        </h1>
        <p className="mt-2 text-center text-ink-600">{t.choose.sub}</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <Link
            href={localizedHref("/register/provider", locale)}
            className="group relative overflow-hidden rounded-lg bg-brand-700 p-8 transition-[background-color,transform] duration-200 ease-snap hover:bg-brand-800 dark:bg-brand-50 dark:hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 dark:text-brand-900/70">
              REG-P / PRO
            </span>
            <span className="mt-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white dark:bg-brand-900/10 dark:text-brand-900">
              <FaScrewdriverWrench className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-white dark:text-brand-900">
              {t.choose.offerTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-100 dark:text-brand-900/80">
              {t.choose.offerBody}
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-white dark:text-brand-900">
              {t.choose.offerCta}
            </span>
          </Link>

          <Link
            href={localizedHref("/register/customer", locale)}
            className="tech-corners card group relative p-8 transition-[border-color,transform] duration-200 ease-snap hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              REG-C / CUSTOMER
            </span>
            <span className="mt-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <FaHouse className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-ink-900 transition-colors duration-200 group-hover:text-brand-700">
              {t.choose.needTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              {t.choose.needBody}
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-brand-700">
              {t.choose.needCta}
            </span>
          </Link>
        </div>

        <div className="mx-auto mt-10 max-w-md">
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
            <span className="h-px flex-1 bg-ink-200" />
            {t.oauth.divider}
            <span className="h-px flex-1 bg-ink-200" />
          </div>
          <div className="mt-6 space-y-3">
            <GoogleSignInButton label={t.oauth.continueWithGoogle} />
            <FacebookSignInButton label={t.oauth.continueWithFacebook} />
          </div>
          <p className="mt-3 text-center text-xs text-ink-500">{t.oauth.dataUse}</p>
          <ConsentNotice />
        </div>

        <p className="mt-8 text-center text-sm text-ink-500">
          {t.choose.already}{" "}
          <Link
            href={localizedHref("/login", locale)}
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            {t.choose.signIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
