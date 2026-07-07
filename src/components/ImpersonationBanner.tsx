import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import ImpersonationEndButton from "./ImpersonationEndButton";

// Site-wide indicator shown for the duration of an admin impersonation
// session (#234) — rendered by the root layout whenever getSession() returns
// an impersonation payload. Fixed so it stays visible on every page,
// including while scrolled.
export default async function ImpersonationBanner({ name }: { name: string }) {
  const t = dict[await getLocale()].admin;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-center gap-4 bg-amber-600 px-4 text-sm text-white shadow-md"
    >
      <span className="truncate font-medium">
        {t.impersonationBannerLabel(name)}
      </span>
      <ImpersonationEndButton />
    </div>
  );
}
