import type { Metadata } from "next";
import { fetchCategoryOptions } from "@/lib/categories-server";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import ProviderRegisterForm from "./ProviderRegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.registerProvider };
}

// Server wrapper: category options come from provider-service's managed list
// (static fallback inside fetchCategoryOptions); the multi-step form itself
// is a client component.
//
// Caching (#57): public-and-stable. The only data here is the category list,
// which changes rarely — serve it from the Data Cache with a 5-minute
// revalidate instead of force-dynamic + no-store.
export default async function ProviderRegisterPage() {
  const categories = await fetchCategoryOptions({ revalidate: 300 });
  // Optional Turnstile site key (#633), read at request time (runtime env);
  // unset → the form renders no widget and submits as before.
  return (
    <ProviderRegisterForm
      categories={categories}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
    />
  );
}
