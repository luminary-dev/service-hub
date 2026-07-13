import type { Metadata } from "next";
import LegalArticle from "@/components/LegalArticle";
import { legal } from "@/lib/legal";
import { languageAlternates } from "@/lib/links";
import { getLocale, getUrlLocale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, urlLocale] = await Promise.all([getLocale(), getUrlLocale()]);
  const doc = legal[locale].privacy;
  return {
    title: doc.title,
    description: doc.metaDescription,
    alternates: languageAlternates("/privacy", urlLocale),
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  return <LegalArticle doc={legal[locale].privacy} tag="PRIVACY" />;
}
