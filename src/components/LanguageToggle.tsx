"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "./I18nProvider";
import type { Locale } from "@/lib/i18n";

function writeLocaleCookie(next: Locale) {
  document.cookie = `lang=${next};path=/;max-age=31536000;samesite=lax`;
}

export default function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();

  function setLocale(next: Locale) {
    if (next === locale) return;
    writeLocaleCookie(next);
    router.refresh();
  }

  return (
    <div
      className="flex items-center rounded-full border border-ink-200 bg-ink-100 p-0.5"
      role="group"
      aria-label="Language"
    >
      {(
        [
          ["en", "EN"],
          ["si", "සිං"],
        ] as [Locale, string][]
      ).map(([value, label]) => (
        <button
          key={value}
          onClick={() => setLocale(value)}
          aria-pressed={locale === value}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition-[background-color,color] duration-200 ease-snap ${
            locale === value
              ? "bg-white text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
