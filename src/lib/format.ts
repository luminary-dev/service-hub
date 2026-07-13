// Locale-aware number/date formatting (#44): Sinhala gets si-LK digits,
// grouping and month names; English keeps the en-LK/en-GB conventions the UI
// has always used. Client components get the locale from useLocale(), server
// components from getLocale().
import type { Locale } from "@/lib/i18n";

export function intlLocale(locale: Locale): string {
  return locale === "si" ? "si-LK" : "en-LK";
}

export function formatNumber(n: number, locale: Locale): string {
  return n.toLocaleString(intlLocale(locale));
}

export function formatLKR(amount: number, locale: Locale): string {
  return `Rs. ${formatNumber(amount, locale)}`;
}

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

export function formatDate(
  d: string | Date,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS
): string {
  // Pin to Sri Lanka time so a UTC server and a local browser render the same
  // calendar day — otherwise SSR'd dates can hydrate to a different day (#377).
  return new Date(d).toLocaleDateString(intlLocale(locale), {
    timeZone: "Asia/Colombo",
    ...opts,
  });
}

// Whole days elapsed since `d` (never negative — clock skew or a
// just-now timestamp both read as 0). Used for SLA/age badges like the
// verification queue's "waiting N days" indicator.
export function daysSince(d: string | Date, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(d).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
