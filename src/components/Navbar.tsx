import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import UserMenu from "./UserMenu";
import LanguageToggle from "./LanguageToggle";

export default async function Navbar() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = dict[locale];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink-900">
            Baas<span className="text-brand-600">.lk</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/providers" className="btn-ghost">
            {t.nav.find}
          </Link>
          {!session && (
            <Link href="/register/provider" className="btn-ghost">
              {t.nav.offer}
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle />
          {session ? (
            <UserMenu name={session.name} role={session.role} />
          ) : (
            <>
              <Link href="/login" className="btn-ghost hidden sm:inline-flex">
                {t.nav.signIn}
              </Link>
              <Link href="/register" className="btn-primary !px-4 !py-2">
                {t.nav.getStarted}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
