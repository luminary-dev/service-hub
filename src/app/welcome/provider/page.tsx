import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { localizedHref } from "@/lib/links";
import { fetchCategoryOptions } from "@/lib/categories-server";
import ProviderRegisterForm from "@/app/register/provider/ProviderRegisterForm";

export const metadata = { title: "Set up your provider profile — Baas.lk" };

// Authenticated provider-profile completion (#398). Reuses the registration
// wizard in `authed` mode: it skips the account step and posts to
// /api/auth/complete-provider, which creates the profile and flips the signed-in
// user's role to PROVIDER.
export default async function WelcomeProviderPage() {
  const session = await getSession();
  const locale = await getLocale();
  if (!session) redirect(localizedHref("/login", locale));
  if (session.role === "PROVIDER") redirect(localizedHref("/dashboard", locale));
  if (session.role !== "CUSTOMER") redirect(localizedHref("/", locale));

  const categories = await fetchCategoryOptions({ revalidate: 300 });
  return <ProviderRegisterForm categories={categories} authed />;
}
