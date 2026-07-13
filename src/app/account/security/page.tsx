import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { localizedHref } from "@/lib/links";
import SecuritySettings from "@/components/SecuritySettings";

// Caching (#57): session-gated and must reflect the user's own writes
// immediately — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect(localizedHref("/login", locale));

  return <SecuritySettings />;
}
