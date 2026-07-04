"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useT } from "./I18nProvider";
import { localizedHref } from "@/lib/links";
import type { Locale } from "@/lib/i18n";

function writeLocaleCookie(next: Locale) {
  document.cookie = `lang=${next};path=/;max-age=31536000;samesite=lax`;
}

export default function LanguageToggle() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();

  function setLocale(next: Locale) {
    if (next === locale) return;
    // The cookie stays the source of truth for the API layer (emails etc.)
    // and for unprefixed URLs; the /si URL prefix is what makes localized
    // pages indexable and shareable (#67).
    writeLocaleCookie(next);
    const current = pathname + window.location.search;
    const target = localizedHref(current, next);
    // Only ever navigate to a same-origin absolute path. pathname is
    // router-provided, but window.location.search is attacker-controllable —
    // reject anything that isn't a single-slash-rooted path (blocks
    // protocol-relative "//host" and any scheme reaching location.assign).
    if (!/^\/(?!\/)/.test(target)) {
      router.refresh();
      return;
    }
    if (target === current) {
      router.refresh();
    } else {
      // Full navigation: the prefixed and unprefixed URL render different
      // languages, so bypass any client-router-cached RSC payloads.
      window.location.assign(target);
    }
  }

  return (
    <div
      className="flex items-center rounded-full border border-ink-200 bg-ink-100 p-0.5"
      role="group"
      aria-label={t.nav.language}
    >
      {(
        [
          ["en", "EN"],
          ["si", "සිං"],
        ] as [Locale, string][]
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setLocale(value)}
          aria-pressed={locale === value}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition-[background-color,color] duration-200 ease-snap ${
            locale === value
              ? "bg-white text-ink-900 shadow-sm dark:bg-ink-300"
              : "text-ink-500 hover:text-ink-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
