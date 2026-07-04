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
  return new Date(d).toLocaleDateString(intlLocale(locale), opts);
}
