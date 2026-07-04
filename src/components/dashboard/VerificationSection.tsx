"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FaCircleCheck, FaClock, FaShieldHalved } from "react-icons/fa6";
import { useT } from "../I18nProvider";

export default function VerificationSection({
  status: initialStatus,
}: {
  status: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nicRef = useRef<HTMLInputElement>(null);
  const bizRef = useRef<HTMLInputElement>(null);
  const t = useT().verification;
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fd = new FormData();
    const nic = nicRef.current?.files?.[0];
    const biz = bizRef.current?.files?.[0];
    if (!nic && !biz) {
      setError(t.pickOne);
      return;
    }
    if (nic) fd.append("nic", nic);
    if (biz) fd.append("business", biz);

    setLoading(true);
    const res = await fetch("/api/provider/verification", {
      method: "POST",
      body: fd,
    });
    setLoading(false);
    if (res.ok) {
      setStatus("PENDING");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? t.error);
    }
  }

  if (status === "VERIFIED") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
        <FaCircleCheck className="h-5 w-5 shrink-0 text-brand-600" />
        <div>
          <p className="text-sm font-semibold text-brand-900">
            {t.verifiedTitle}
          </p>
          <p className="text-sm text-brand-800">{t.verifiedBody}</p>
        </div>
      </div>
    );
  }

  if (status === "PENDING") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <FaClock className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            {t.pendingTitle}
          </p>
          <p className="text-sm text-amber-800">{t.pendingBody}</p>
        </div>
      </div>
    );
  }

  // NONE or REJECTED — show the submit form.
  return (
    <div className="mb-6 rounded-2xl border border-ink-200 bg-surface p-5">
      <div className="flex items-center gap-2">
        <FaShieldHalved className="h-5 w-5 text-brand-600" />
        <h2 className="font-semibold text-ink-900">{t.title}</h2>
      </div>
      {status === "REJECTED" ? (
        <p className="mt-1 text-sm text-red-600">{t.rejectedBody}</p>
      ) : (
        <p className="mt-1 text-sm text-ink-600">{t.intro}</p>
      )}

      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="vs-nicLabel">
            {t.nicLabel}
          </label>
          <input
            id="vs-nicLabel"
            ref={nicRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="vs-businessLabel">
            {t.businessLabel}
          </label>
          <input
            id="vs-businessLabel"
            ref={bizRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="input"
          />
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-ink-500">{t.privacyHint}</p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary mt-3">
            {loading
              ? t.submitting
              : status === "REJECTED"
                ? t.resubmit
                : t.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
