import Link from "next/link";
import { FaHeart } from "@/components/icons";
import { CATEGORIES } from "@/lib/constants";
import { dict, categoryLabelLoc } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { localizedHref } from "@/lib/links";

export default async function Footer() {
  const locale = await getLocale();
  const t = dict[locale];

  return (
    <footer className="blueprint-grid border-t border-ink-300 bg-ink-100">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-700 font-display text-base font-bold text-white dark:text-ink-50">
                B
              </span>
              <span className="font-display text-lg font-bold tracking-tight text-ink-900">
                Baas<span className="text-brand-600">.lk</span>
              </span>
            </div>
            <p className="mt-3 max-w-[36ch] text-sm leading-relaxed text-ink-600">
              {t.footer.tagline}
            </p>
          </div>

          <div>
            <h3 className="eyebrow text-ink-500">
              {t.footer.popular}
            </h3>
            <ul className="mt-3 space-y-2">
              {CATEGORIES.slice(0, 6).map((c) => (
                <li key={c.slug}>
                  <Link
                    href={localizedHref(`/providers?category=${c.slug}`, locale)}
                    className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                  >
                    {categoryLabelLoc(c.slug, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="eyebrow text-ink-500">
              {t.footer.forPros}
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href={localizedHref("/register/provider", locale)}
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  {t.footer.joinPro}
                </Link>
              </li>
              <li>
                <Link
                  href={localizedHref("/login", locale)}
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  {t.footer.signIn}
                </Link>
              </li>
              <li>
                <Link
                  href={localizedHref("/dashboard", locale)}
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  {t.footer.dashboard}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="eyebrow text-ink-500">
              {t.footer.forCustomers}
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href={localizedHref("/providers", locale)}
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  {t.footer.browse}
                </Link>
              </li>
              <li>
                <Link
                  href={localizedHref("/register/customer", locale)}
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  {t.footer.createAccount}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-1.5 border-t border-dashed border-ink-300 pt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500">
          <span className="tabular-nums">© {new Date().getFullYear()}</span>
          <span>Baas.lk · {t.footer.made1}</span>
          <FaHeart className="h-3 w-3 text-brand-500" />
          {t.footer.made2}
          <span className="ml-auto flex items-center gap-4">
            <Link
              href={localizedHref("/terms", locale)}
              className="transition-colors duration-200 hover:text-brand-700"
            >
              {t.footer.terms}
            </Link>
            <Link
              href={localizedHref("/privacy", locale)}
              className="transition-colors duration-200 hover:text-brand-700"
            >
              {t.footer.privacy}
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
