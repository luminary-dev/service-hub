import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import ForgotPasswordForm from "./ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.forgotPassword };
}

// Thin server wrapper so the page can export a localized <title> (#762); the
// form itself is a client component (no useSearchParams, so no Suspense).
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
