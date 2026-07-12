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

  // Mono uppercase nav treatment — steel by default, brand on hover; mirrors
  // the "view all" / spec-marker links across the UI 2.0 pages.
  const navLink =
    "rounded-md px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-600 transition-colors duration-200 ease-snap hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300";

  return (
    <header className="sticky top-0 z-40 border-b border-ink-300 bg-ink-50/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href={localizedHref("/", locale)}
          className="flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-700 font-display text-base font-bold text-white dark:text-ink-50">
            B
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-ink-900">
            Baas<span className="text-brand-600">.lk</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link href={localizedHref("/providers", locale)} className={navLink}>
            {t.nav.find}
          </Link>
          {session ? (
            <Link href={localizedHref("/jobs", locale)} className={navLink}>
              {t.nav.jobs}
            </Link>
          ) : (
            <Link
              href={localizedHref("/register/provider", locale)}
              className={navLink}
            >
              {t.nav.offer}
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle initialTheme={theme} />
            <LanguageToggle />
            {/* hairline divider between utility toggles and account actions */}
            <span aria-hidden className="mx-1 h-5 w-px bg-ink-300" />
          </div>
          {session ? (
            <UserMenu name={session.name} role={session.role} avatarUrl={session.avatar} />
          ) : (
            <>
              <Link
                href={localizedHref("/login", locale)}
                className="btn-ghost hidden sm:inline-flex"
              >
                {t.nav.signIn}
              </Link>
              <Link
                href={localizedHref("/register", locale)}
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
