import { fetchCategoryOptions } from "@/lib/categories-server";
import ProviderRegisterForm from "./ProviderRegisterForm";

export const dynamic = "force-dynamic";

// Server wrapper: category options come from provider-service's managed list
// (static fallback inside fetchCategoryOptions); the multi-step form itself
// is a client component.
export default async function ProviderRegisterPage() {
  const categories = await fetchCategoryOptions();
  return <ProviderRegisterForm categories={categories} />;
}
