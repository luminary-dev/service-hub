import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import ResetPasswordForm from "./ResetPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.resetPassword };
}

// Thin server wrapper so the page can export a localized <title> (#762); the
// form itself is a client component and already wraps its useSearchParams
// child in its own Suspense boundary.
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
