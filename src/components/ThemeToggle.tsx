"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaMoon, FaSun } from "@/components/icons";
import { useT } from "./I18nProvider";
import type { Theme } from "@/lib/theme";

/** Mirrors the `lang` cookie pattern. Light is the default, so both values are
 *  stored explicitly (there is no "system" state to clear back to). */
function writeThemeCookie(next: Theme) {
  document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
}

function applyTheme(next: Theme) {
  document.documentElement.classList.toggle("dark", next === "dark");
}

// One button that toggles between light and dark. The server (Navbar) passes
// the cookie-derived theme so SSR and hydration agree.
export default function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const router = useRouter();
  const t = useT();
  const [theme, setThemeState] = useState(initialTheme);

  // Keep multiple instances (desktop navbar + mobile menu) in sync: after
  // router.refresh() the server prop reflects the new cookie — adopt it.
  const [lastInitial, setLastInitial] = useState(initialTheme);
  if (initialTheme !== lastInitial) {
    setLastInitial(initialTheme);
    setThemeState(initialTheme);
  }

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    writeThemeCookie(next);
    applyTheme(next);
    router.refresh();
  }

  // Announce the action: in light mode the button switches to dark, and vice versa.
  const label = theme === "dark" ? t.nav.themeLight : t.nav.themeDark;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-ink-200 bg-ink-100 text-ink-600 transition-[background-color,color] duration-200 ease-snap hover:bg-ink-200 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-300"
    >
      {theme === "dark" ? (
        <FaMoon aria-hidden className="h-4 w-4" />
      ) : (
        <FaSun aria-hidden className="h-4 w-4" />
      )}
    </button>
  );
}
