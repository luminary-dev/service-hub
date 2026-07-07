"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./I18nProvider";

// Ends the impersonation session started at /admin/impersonate (#234) and
// returns the admin to their own session — the admin's sh_session cookie was
// never touched by impersonation, so clearing impersonation_session is all
// that's needed.
export default function ImpersonationEndButton() {
  const t = useT().admin;
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");

  async function end() {
    if (ending) return;
    setEnding(true);
    setError("");
    const res = await fetch("/api/admin/impersonate/end", {
      method: "POST",
    }).catch(() => null);
    setEnding(false);
    if (res && res.ok) {
      router.push("/admin");
      router.refresh();
      return;
    }
    setError(t.impersonationEndError);
  }

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span role="alert" className="text-xs text-red-100">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={end}
        disabled={ending}
        className="cursor-pointer rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ending ? t.impersonationEnding : t.impersonationEndButton}
      </button>
    </div>
  );
}
