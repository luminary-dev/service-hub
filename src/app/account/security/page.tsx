import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SecuritySettings from "@/components/SecuritySettings";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <SecuritySettings />;
}
