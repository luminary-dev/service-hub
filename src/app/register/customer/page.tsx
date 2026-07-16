import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import CustomerRegisterForm from "./CustomerRegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.registerCustomer };
}

// Server wrapper: reads the optional Turnstile site key (#633) at request time
// (runtime env, like NEXT_PUBLIC_SITE_URL) and passes it to the client form, so
// bot protection can be switched on/off by env alone. Unset → no widget.
export default function CustomerRegisterPage() {
  return (
    <CustomerRegisterForm
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
    />
  );
}
