"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { FaBars, FaXmark } from "react-icons/fa6";
import { useT } from "./I18nProvider";
import LanguageToggle from "./LanguageToggle";

// Hamburger menu for small screens. Mirrors the desktop nav links plus the
// auth actions and language toggle; the server Navbar passes the session down.
export default function MobileMenu({
  session,
}: {
  session: { role: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  // Close whenever navigation actually happens (covers back/forward too) —
  // state adjusted during render, per the React "you might not need an
  // effect" guidance.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const close = () => setOpen(false);
  const itemClass =
    "block rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-100 hover:text-ink-900";

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-ink-700 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {open ? <FaXmark className="h-5 w-5" /> : <FaBars className="h-5 w-5" />}
      </button>

      {open && (
        <nav
          id="mobile-menu"
          className="absolute inset-x-0 top-16 border-b border-ink-200 bg-white p-3 shadow-lg"
        >
          <Link href="/providers" onClick={close} className={itemClass}>
            {t.nav.find}
          </Link>
          {session ? (
            <>
              <Link href="/jobs" onClick={close} className={itemClass}>
                {t.nav.jobs}
              </Link>
              {session.role === "PROVIDER" && (
                <Link href="/dashboard" onClick={close} className={itemClass}>
                  {t.nav.dashboard}
                </Link>
              )}
              {session.role === "ADMIN" && (
                <Link href="/admin" onClick={close} className={itemClass}>
                  {t.nav.admin}
                </Link>
              )}
              <Link href="/account" onClick={close} className={itemClass}>
                {t.nav.saved}
              </Link>
              <button
                type="button"
                onClick={logout}
                className="block w-full cursor-pointer rounded-xl px-4 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                {t.nav.signOut}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/register/provider"
                onClick={close}
                className={itemClass}
              >
                {t.nav.offer}
              </Link>
              <Link href="/login" onClick={close} className={itemClass}>
                {t.nav.signIn}
              </Link>
              <Link href="/register" onClick={close} className={itemClass}>
                {t.nav.getStarted}
              </Link>
            </>
          )}
          <div className="mt-2 flex border-t border-ink-100 px-4 pt-3 pb-1">
            <LanguageToggle />
          </div>
        </nav>
      )}
    </div>
  );
}
