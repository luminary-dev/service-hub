import type { Metadata } from "next";
import LegalArticle from "@/components/LegalArticle";
import { legal } from "@/lib/legal";
import { languageAlternates } from "@/lib/links";
import { getLocale, getUrlLocale } from "@/lib/locale";
import { siteOpenGraph } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, urlLocale] = await Promise.all([getLocale(), getUrlLocale()]);
  const doc = legal[locale].privacy;
  return {
    title: doc.title,
    description: doc.metaDescription,
    alternates: languageAlternates("/privacy", urlLocale),
    // Spread over the site defaults so og:url matches the canonical (#379).
    openGraph: {
      ...siteOpenGraph(locale, urlLocale, "/privacy"),
      title: doc.title,
      description: doc.metaDescription,
    },
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  return <LegalArticle doc={legal[locale].privacy} tag="PRIVACY" />;
}
