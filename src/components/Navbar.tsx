import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getTheme } from "@/lib/theme";
import { dict } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";
import UserMenu from "./UserMenu";
import LanguageToggle from "./LanguageToggle";
import ThemeToggle from "./ThemeToggle";
import MobileMenu from "./MobileMenu";

export default async function Navbar() {
  const [session, locale, theme] = await Promise.all([
    getSession(),
    getLocale(),
    getTheme(),
  ]);
  const t = dict[locale];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-surface/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href={localizedHref("/", locale)}
          className="flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white dark:text-ink-50">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink-900">
            Baas<span className="text-brand-600">.lk</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link href={localizedHref("/providers", locale)} className="btn-ghost">
            {t.nav.find}
          </Link>
          {session ? (
            <Link href="/jobs" className="btn-ghost">
              {t.nav.jobs}
            </Link>
          ) : (
            <Link href="/register/provider" className="btn-ghost">
              {t.nav.offer}
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle initialTheme={theme} />
            <LanguageToggle />
          </div>
          {session ? (
            <UserMenu name={session.name} role={session.role} />
          ) : (
            <>
              <Link href="/login" className="btn-ghost hidden sm:inline-flex">
                {t.nav.signIn}
              </Link>
              <Link
                href="/register"
                className="btn-primary hidden !px-4 !py-2 md:inline-flex"
              >
                {t.nav.getStarted}
              </Link>
            </>
          )}
          <MobileMenu
            session={session ? { role: session.role } : null}
            theme={theme}
          />
        </div>
      </div>
    </header>
  );
}
