"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IconType } from "react-icons";
import { FaCircleHalfStroke, FaMoon, FaSun } from "react-icons/fa6";
import { useT } from "./I18nProvider";
import type { Theme } from "@/lib/theme";

/** Matches the cookie written below; mirrors the `lang` cookie pattern. */
function writeThemeCookie(next: Theme) {
  document.cookie =
    next === "system"
      ? "theme=;path=/;max-age=0;samesite=lax"
      : `theme=${next};path=/;max-age=31536000;samesite=lax`;
}

function applyTheme(next: Theme) {
  const dark =
    next === "dark" ||
    (next === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// The single button cycles through these in order.
const ORDER: Theme[] = ["light", "dark", "system"];
const ICONS: Record<Theme, IconType> = {
  light: FaSun,
  dark: FaMoon,
  system: FaCircleHalfStroke,
};

// One icon button that shows the current mode and cycles light → dark → system
// on click (was a 3-segment control — see #204 discussion). The server (Navbar)
// passes the cookie-derived theme so SSR and hydration agree.
export default function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const router = useRouter();
  const t = useT();
  const [theme, setThemeState] = useState(initialTheme);

  // Keep multiple instances (desktop navbar + mobile menu) in sync: after
  // router.refresh() the server prop reflects the new cookie — adopt it.
  // State adjusted during render, per "you might not need an effect".
  const [lastInitial, setLastInitial] = useState(initialTheme);
  if (initialTheme !== lastInitial) {
    setLastInitial(initialTheme);
    setThemeState(initialTheme);
  }

  const labels: Record<Theme, string> = {
    light: t.nav.themeLight,
    dark: t.nav.themeDark,
    system: t.nav.themeSystem,
  };

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setThemeState(next);
    writeThemeCookie(next);
    applyTheme(next);
    router.refresh();
  }

  const Icon = ICONS[theme];
  // Announces the current mode (updates as it cycles) so AT users hear the
  // state; the button role conveys it's actionable.
  const label = `${t.nav.theme}: ${labels[theme]}`;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-ink-200 bg-ink-100 text-ink-600 transition-[background-color,color] duration-200 ease-snap hover:bg-ink-200 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-300"
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
}
