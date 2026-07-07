"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FaBars, FaXmark } from "@/components/icons";
import { useLocale, useT } from "./I18nProvider";
import { localizedHref } from "@/lib/links";
import LanguageToggle from "./LanguageToggle";
import ThemeToggle from "./ThemeToggle";
import type { Theme } from "@/lib/theme";

// Hamburger menu for small screens. Mirrors the desktop nav links plus the
// auth actions and language/theme toggles; the server Navbar passes the
// session and cookie-derived theme down.
export default function MobileMenu({
  session,
  theme,
}: {
  session: { role: string } | null;
  theme: Theme;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();

  // Close whenever navigation actually happens (covers back/forward too) —
  // state adjusted during render, per the React "you might not need an
  // effect" guidance.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // Close on a click outside the menu (parity with UserMenu), only while open.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function logout() {
    if (signingOut) return; // guard against a double-tap firing two POSTs
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setOpen(false);
      router.push("/");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  const close = () => setOpen(false);
  const itemClass =
    "block rounded-xl px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-100 hover:text-ink-900";

  return (
    <div
      className="md:hidden"
      ref={menuRef}
      // Escape closes the menu from anywhere inside it and puts focus back
      // on the toggle, so keyboard users are not stranded mid-menu.
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <button
        ref={toggleRef}
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
          className="absolute inset-x-0 top-16 border-b border-ink-200 bg-surface p-3 shadow-lg"
        >
          <Link
            href={localizedHref("/providers", locale)}
            onClick={close}
            className={itemClass}
          >
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
                disabled={signingOut}
                className="block w-full cursor-pointer rounded-xl px-4 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-red-950"
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
          <div className="mt-2 flex items-center gap-3 border-t border-ink-100 px-4 pt-3 pb-1">
            <LanguageToggle />
            <ThemeToggle initialTheme={theme} />
          </div>
        </nav>
      )}
    </div>
  );
}
