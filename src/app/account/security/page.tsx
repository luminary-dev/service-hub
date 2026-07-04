import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SecuritySettings from "@/components/SecuritySettings";

// Caching (#57): session-gated and must reflect the user's own writes
// immediately — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <SecuritySettings />;
}
