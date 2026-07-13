import type { Metadata } from "next";
import LegalArticle from "@/components/LegalArticle";
import { legal } from "@/lib/legal";
import { languageAlternates } from "@/lib/links";
import { getLocale, getUrlLocale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, urlLocale] = await Promise.all([getLocale(), getUrlLocale()]);
  const doc = legal[locale].terms;
  return {
    title: doc.title,
    description: doc.metaDescription,
    alternates: languageAlternates("/terms", urlLocale),
  };
}

export default async function TermsPage() {
  const locale = await getLocale();
  return <LegalArticle doc={legal[locale].terms} tag="TERMS" />;
}
