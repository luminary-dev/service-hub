"use client";

import { useState } from "react";
import {
  notificationTypeLabel,
  type NotificationPreferenceDTO,
} from "@/lib/notifications";
import { useLocale, useT } from "./I18nProvider";
import { useToast } from "./ToastProvider";

type Channel = "emailEnabled" | "inAppEnabled";

// Per-type notification channel toggles on /account (#394). The API returns
// the full catalog × channel matrix (defaults merged over the user's sparse
// overrides), so this list never has to know the catalog; each change
// upserts one override via POST /api/notification-preferences, optimistic
// with revert-on-failure (same pattern as SavedSearches). The transactional
// auth/security emails are not in the catalog and are never shown here.
export default function NotificationPreferences({
  initial,
}: {
  initial: NotificationPreferenceDTO[] | null;
}) {
  const t = useT().notifications;
  const locale = useLocale();
  const toast = useToast();
  const [prefs, setPrefs] = useState(initial ?? []);

  if (!initial) {
    return <p className="mt-6 text-sm text-ink-500">{t.prefsLoadError}</p>;
  }

  async function toggle(type: string, channel: Channel, value: boolean) {
    setPrefs((prev) =>
      prev.map((p) => (p.type === type ? { ...p, [channel]: value } : p))
    );
    const res = await fetch("/api/notification-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, [channel]: value }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setPrefs((prev) =>
        prev.map((p) => (p.type === type ? { ...p, [channel]: !value } : p))
      );
      toast.error(t.prefsError);
    }
  }

  const headCell =
    "px-2 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500";

  return (
    <div>
      <p className="mt-2 max-w-prose text-sm text-ink-500">{t.prefsHint}</p>
      <div className="tech-corners card mt-4 overflow-x-auto p-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200">
              <th scope="col" className="sr-only">
                {t.prefsTitle}
              </th>
              <th scope="col" className={`${headCell} py-2.5`}>
                {t.prefsEmail}
              </th>
              <th scope="col" className={`${headCell} py-2.5`}>
                {t.prefsInApp}
              </th>
            </tr>
          </thead>
          <tbody>
            {prefs.map((p, i) => {
              const label = notificationTypeLabel(p.type, locale);
              return (
                <tr
                  key={p.type}
                  className={i > 0 ? "border-t border-dashed border-ink-200" : ""}
                >
                  <th
                    scope="row"
                    className="py-2.5 pl-2 pr-4 text-left font-medium text-ink-800"
                  >
                    {label}
                  </th>
                  {(["emailEnabled", "inAppEnabled"] as const).map(
                    (channel) => (
                      <td key={channel} className="w-20 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={p[channel]}
                          onChange={(e) =>
                            toggle(p.type, channel, e.target.checked)
                          }
                          aria-label={`${label} — ${
                            channel === "emailEnabled"
                              ? t.prefsEmail
                              : t.prefsInApp
                          }`}
                          className="h-5 w-5 cursor-pointer accent-brand-700"
                        />
                      </td>
                    )
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
