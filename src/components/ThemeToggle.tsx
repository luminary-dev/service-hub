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

// Sun / moon / system segmented control, styled after LanguageToggle. The
// server (Navbar) passes the cookie-derived theme so SSR and hydration agree.
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

  function setTheme(next: Theme) {
    if (next === theme) return;
    setThemeState(next);
    writeThemeCookie(next);
    applyTheme(next);
    router.refresh();
  }

  const options: [Theme, IconType, string][] = [
    ["light", FaSun, t.nav.themeLight],
    ["dark", FaMoon, t.nav.themeDark],
    ["system", FaCircleHalfStroke, t.nav.themeSystem],
  ];

  return (
    <div
      className="flex items-center rounded-full border border-ink-200 bg-ink-100 p-0.5"
      role="group"
      aria-label={t.nav.theme}
    >
      {options.map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          className={`flex h-6 w-7 cursor-pointer items-center justify-center rounded-full transition-[background-color,color] duration-200 ease-snap ${
            theme === value
              ? "bg-white text-ink-900 shadow-sm dark:bg-ink-300"
              : "text-ink-500 hover:text-ink-800"
          }`}
        >
          <Icon aria-hidden className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
