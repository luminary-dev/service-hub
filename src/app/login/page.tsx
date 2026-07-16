import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import LoginForm from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.login };
}

// Thin server wrapper so the page can export a localized <title> (#762); the
// form itself is a client component. It reads ?next/?error via
// useSearchParams, which Next 16 requires to sit under a Suspense boundary in
// a server-rendered subtree.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
